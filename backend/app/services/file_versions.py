"""파일 버전 규칙 (ADR-0022).

- 덮어쓰기·복원 때 밀려난 내용을 FileVersion 으로 남긴다.
- 같은 사람이 10분 안에 다시 저장하면 버전을 만들지 않는다(묶기). 복원은 예외.
- 30일 지난 버전은 크론이 지운다. 파일당 50개까지.
- 한도는 버전까지 포함해 맞추되, 저장을 막지 않고 버전을 지워 자리를 만든다.
  순서: 그 파일 → 같은 소유자의 다른 파일 → 회사 전체.

함수들은 DB 행만 정리하고, 지워야 할 S3 key 목록을 돌려준다. 호출자가 커밋한 뒤
delete_objects() 로 지운다(커밋 실패 시 살아있는 행이 가리키는 객체를 지우지 않게).
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.core.logging import logger
from app.core.storage import delete_object
from app.models.file_version import FileVersion
from app.models.node import Node
from app.services import quotas
from app.services.audit import write_audit
from app.services.nodes import new_node_id

COALESCE_WINDOW = timedelta(minutes=10)
RETENTION = timedelta(days=30)
MAX_PER_FILE = 50


def mark_content(node: Node, *, saved_by: str, saved_at: datetime) -> None:
    """현재 내용을 누가 언제 저장했는지 기록 (묶기 판정 기준)."""
    node.content_updated_by = saved_by
    node.content_updated_at = saved_at


async def retire_current(
    db: AsyncSession,
    node: Node,
    *,
    actor: UserContext,
    now: datetime,
    always: bool = False,
) -> list[str]:
    """현재 내용을 버전으로 돌린다. 묶기 대상이면 버전 없이 버린다.

    always=True(복원)면 묶기를 건너뛴다. 반환: 커밋 후 지울 S3 key.
    """
    if not node.storage_key:
        return []
    if not always and await _coalescable(db, node, actor=actor, now=now):
        return [node.storage_key]

    db.add(
        FileVersion(
            id=new_node_id(),
            node_id=node.id,
            company_id=node.company_id,
            storage_key=node.storage_key,
            size_bytes=node.size_bytes or 0,
            etag=node.etag,
            wrapped_dek=node.wrapped_dek,
            saved_by=node.content_updated_by or node.owner_id,
            saved_at=node.content_updated_at or node.created_at,
            created_at=now,
        )
    )
    await db.flush()
    return await _enforce_cap(db, node, actor=actor)


async def _coalescable(
    db: AsyncSession, node: Node, *, actor: UserContext, now: datetime
) -> bool:
    """같은 사람이 10분 안에 다시 저장한 경우에만 버전 없이 덮는다.

    단, 현재 내용이 저장된 뒤에 만들어진 버전이 있으면 묶지 않는다. 복원이 그 경우다:
    복원은 직전 내용을 즉시 버전으로 돌리고, 현재 내용의 저장 시각은 원래 시각으로
    둔다. 이걸 막지 않으면 복원 직후 같은 사람이 저장할 때 복원해 온 내용이 버려진다.
    """
    if (
        node.content_updated_by != actor.sub
        or node.content_updated_at is None
        or now - node.content_updated_at >= COALESCE_WINDOW
    ):
        return False
    newer = await db.scalar(
        select(FileVersion.id)
        .where(
            FileVersion.node_id == node.id,
            FileVersion.created_at > node.content_updated_at,
        )
        .limit(1)
    )
    return newer is None


async def _enforce_cap(db: AsyncSession, node: Node, *, actor: UserContext) -> list[str]:
    stale = (
        await db.scalars(
            select(FileVersion)
            .where(FileVersion.node_id == node.id)
            .order_by(FileVersion.created_at.desc())
            .offset(MAX_PER_FILE)
        )
    ).all()
    return [await _drop(db, v, actor=actor, reason="cap") for v in stale]


async def reclaim_space(db: AsyncSession, node: Node, *, actor: UserContext) -> list[str]:
    """내용이 늘어난 뒤 호출. 파일+버전이 한도를 넘으면 버전을 지워 맞춘다."""
    company_id, owner = node.company_id, node.owner_id
    keys: list[str] = []

    user_limit = await quotas.get_user_limit(db, company_id=company_id, user_sub=owner)
    if user_limit is not None:
        used = await quotas.compute_user_usage(db, company_id=company_id, user_sub=owner)
        used += await quotas.compute_user_version_usage(db, company_id=company_id, user_sub=owner)
        keys += await _prune(db, used - user_limit, node=node, owner_only=True, actor=actor)

    company_limit = await quotas.get_limit(db, company_id=company_id)
    if company_limit is not None:
        used = await quotas.compute_usage(db, company_id=company_id)
        used += await quotas.compute_version_usage(db, company_id=company_id)
        keys += await _prune(db, used - company_limit, node=node, owner_only=False, actor=actor)
    return keys


async def _prune(
    db: AsyncSession,
    over_bytes: int,
    *,
    node: Node,
    owner_only: bool,
    actor: UserContext,
) -> list[str]:
    if over_bytes <= 0:
        return []
    stmt = (
        select(FileVersion)
        .join(Node, Node.id == FileVersion.node_id)
        # 휴지통 파일의 버전은 사용량에 안 잡히므로 지워도 공간이 안 생긴다.
        .where(FileVersion.company_id == node.company_id, Node.deleted_at.is_(None))
        .order_by(
            case((FileVersion.node_id == node.id, 0), else_=1),
            case((Node.owner_id == node.owner_id, 0), else_=1),
            FileVersion.created_at,
        )
    )
    if owner_only:
        stmt = stmt.where(Node.owner_id == node.owner_id)
    keys: list[str] = []
    freed = 0
    for v in (await db.scalars(stmt)).all():
        if freed >= over_bytes:
            break
        freed += v.size_bytes
        keys.append(await _drop(db, v, actor=actor, reason="quota"))
    return keys


async def _drop(
    db: AsyncSession, v: FileVersion, *, actor: UserContext | None, reason: str
) -> str:
    """버전 행 삭제 + 감사 기록. 반환: 지울 S3 key."""
    await write_audit(
        db,
        company_id=v.company_id,
        actor=actor,
        action="delete",
        entity_type="file_version",
        entity_id=v.id,
        meta={"node_id": v.node_id, "size": v.size_bytes, "reason": reason},
    )
    await db.delete(v)
    await db.flush()
    return v.storage_key


async def delete_version(
    db: AsyncSession, v: FileVersion, *, actor: UserContext
) -> str:
    """사용자가 직접 지움 (관리 권한은 호출자가 확인)."""
    return await _drop(db, v, actor=actor, reason="manual")


async def restore(
    db: AsyncSession, node: Node, v: FileVersion, *, actor: UserContext, now: datetime
) -> list[str]:
    """현재 내용과 버전을 맞바꾼다. 현재 내용은 새 버전이 되고, v 는 현재가 된다.

    S3 복사 없이 key 만 맞바꾸므로 공간이 늘지 않는다. 마지막 저장자·시각은 v 를
    원래 저장했던 사람·시각으로 둔다 — 복원한 사람으로 두면 같은 사람이 10분 안에
    다시 저장할 때 묶기 규칙에 걸려 복원해 온 내용이 버려진다.
    """
    keys = await retire_current(db, node, actor=actor, now=now, always=True)
    node.storage_key = v.storage_key
    node.size_bytes = v.size_bytes
    node.etag = v.etag
    node.wrapped_dek = v.wrapped_dek
    mark_content(node, saved_by=v.saved_by, saved_at=v.saved_at)
    await db.delete(v)
    await db.flush()
    return keys


async def purge_expired(db: AsyncSession, *, now: datetime) -> list[str]:
    """RETENTION 지난 버전 행 삭제 (크론). 정책상 만료라 감사 기록은 남기지 않는다."""
    expired = (
        await db.scalars(select(FileVersion).where(FileVersion.created_at < now - RETENTION))
    ).all()
    keys = [v.storage_key for v in expired]
    for v in expired:
        await db.delete(v)
    await db.flush()
    return keys


async def delete_objects(keys: list[str]) -> None:
    """커밋 후 S3 객체 정리. 실패는 로그만 (고아 객체가 남을 뿐 정합성은 DB 기준)."""
    for key in keys:
        try:
            await delete_object(key)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "file_version_object_delete_failed",
                extra={"category": "biz", "key": key, "error": str(exc)},
            )
