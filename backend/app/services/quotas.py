"""스토리지 quota 서비스 — 사용량 계산 + enforcement.

호출 패턴:
  upload 시작 시 ensure_capacity(company_id, additional_bytes) 호출.
  초과면 HTTPException(413) raise.
"""

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company_quota import CompanyQuota
from app.models.file_version import FileVersion
from app.models.node import Node
from app.models.user_quota import UserQuota


async def compute_usage(db: AsyncSession, *, company_id: str) -> int:
    """active(미삭제, ready) 파일 size_bytes 합계."""
    stmt = select(func.coalesce(func.sum(Node.size_bytes), 0)).where(
        Node.company_id == company_id,
        Node.kind == "file",
        Node.deleted_at.is_(None),
        Node.status == "ready",
    )
    return int((await db.execute(stmt)).scalar_one())


async def get_limit(db: AsyncSession, *, company_id: str) -> int | None:
    """None = 무제한 (quota row 없거나 NULL)."""
    q = await db.get(CompanyQuota, company_id)
    if q is None:
        return None
    return q.storage_bytes_limit


async def ensure_capacity(
    db: AsyncSession, *, company_id: str, additional_bytes: int
) -> None:
    """추가하려는 바이트가 quota 넘으면 413."""
    limit = await get_limit(db, company_id=company_id)
    if limit is None:
        return
    usage = await compute_usage(db, company_id=company_id)
    if usage + additional_bytes > limit:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Storage quota exceeded: "
                f"{usage + additional_bytes} > {limit} bytes "
                f"(quota={limit}, current={usage}, requested={additional_bytes})"
            ),
        )


# ---------------------------------------------------------------------------
# 사용자별 (회사 안 멤버) quota
# ---------------------------------------------------------------------------


async def compute_user_usage(
    db: AsyncSession, *, company_id: str, user_sub: str
) -> int:
    """그 회사에서 해당 사용자가 소유한 active 파일 size_bytes 합계."""
    stmt = select(func.coalesce(func.sum(Node.size_bytes), 0)).where(
        Node.company_id == company_id,
        Node.owner_id == user_sub,
        Node.kind == "file",
        Node.deleted_at.is_(None),
        Node.status == "ready",
    )
    return int((await db.execute(stmt)).scalar_one())


async def compute_user_usages(
    db: AsyncSession, *, company_id: str
) -> dict[str, int]:
    """회사 멤버별 사용량 한 번에 (owner_id 그룹). 멤버 목록 화면용."""
    stmt = (
        select(Node.owner_id, func.coalesce(func.sum(Node.size_bytes), 0))
        .where(
            Node.company_id == company_id,
            Node.kind == "file",
            Node.deleted_at.is_(None),
            Node.status == "ready",
        )
        .group_by(Node.owner_id)
    )
    return {sub: int(total) for sub, total in (await db.execute(stmt)).all()}


async def get_user_limit(
    db: AsyncSession, *, company_id: str, user_sub: str
) -> int | None:
    """None = 무제한 (row 없거나 NULL)."""
    q = await db.get(UserQuota, (company_id, user_sub))
    return q.storage_bytes_limit if q else None


async def ensure_user_capacity(
    db: AsyncSession, *, company_id: str, user_sub: str, additional_bytes: int
) -> None:
    """사용자 개인 한도 초과 시 413."""
    limit = await get_user_limit(db, company_id=company_id, user_sub=user_sub)
    if limit is None:
        return
    usage = await compute_user_usage(
        db, company_id=company_id, user_sub=user_sub
    )
    if usage + additional_bytes > limit:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Personal storage quota exceeded: "
                f"{usage + additional_bytes} > {limit} bytes "
                f"(quota={limit}, current={usage}, requested={additional_bytes})"
            ),
        )


# ---------------------------------------------------------------------------
# 파일 버전 사용량 (ADR-0022) — 한도에 포함하되 저장 차단 판정(ensure_*)엔 안 씀.
# 휴지통 파일의 버전은 파일 자체처럼 사용량에서 뺀다.
# ---------------------------------------------------------------------------


def _version_usage_stmt(company_id: str):
    return (
        select(func.coalesce(func.sum(FileVersion.size_bytes), 0))
        .join(Node, Node.id == FileVersion.node_id)
        .where(FileVersion.company_id == company_id, Node.deleted_at.is_(None))
    )


async def compute_version_usage(db: AsyncSession, *, company_id: str) -> int:
    return int((await db.execute(_version_usage_stmt(company_id))).scalar_one())


async def compute_user_version_usage(
    db: AsyncSession, *, company_id: str, user_sub: str
) -> int:
    stmt = _version_usage_stmt(company_id).where(Node.owner_id == user_sub)
    return int((await db.execute(stmt)).scalar_one())


async def compute_user_version_usages(
    db: AsyncSession, *, company_id: str
) -> dict[str, int]:
    stmt = (
        select(Node.owner_id, func.coalesce(func.sum(FileVersion.size_bytes), 0))
        .join(Node, Node.id == FileVersion.node_id)
        .where(FileVersion.company_id == company_id, Node.deleted_at.is_(None))
        .group_by(Node.owner_id)
    )
    return {sub: int(total) for sub, total in (await db.execute(stmt)).all()}
