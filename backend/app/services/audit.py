"""Audit log helper: 변경 일으키는 라우터가 호출.

write_audit() 는 row 만 add, commit 은 호출자가 함께 (트랜잭션 일체화).
"""

from __future__ import annotations

import uuid
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.models.audit_log import AuditLog


async def write_audit(
    db: AsyncSession,
    *,
    workspace_id: str | None,
    actor: UserContext | None,
    action: str,
    entity_type: str,
    entity_id: str,
    meta: dict | None = None,
    request_id: str | None = None,
    actor_type: str | None = None,
) -> None:
    """actor_type 기본:
      - actor 가 있으면 'user'
      - actor=None 이면 'system'
      - 명시값(예: 'public' for 공개 라우트) 이 있으면 override.
    """
    audit_meta = dict(meta or {})
    # 보안 폴더(vault) 콘텐츠는 암호문 이름과 크기를 활동/감사 로그에 노출하지 않는다.
    # 호출부마다 분기하지 않게 여기서 중앙 마스킹 (ADR-0016).
    if entity_type == "node" and entity_id and entity_id != "*":
        from app.services.nodes import is_vault_content

        if await is_vault_content(db, entity_id):
            audit_meta = {
                k: v for k, v in audit_meta.items() if k not in ("name", "size")
            }
            audit_meta["vault"] = True

    db.add(
        AuditLog(
            id=str(uuid.uuid7()),
            workspace_id=workspace_id,
            actor_sub=actor.sub if actor else None,
            actor_type=actor_type or ("user" if actor else "system"),
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            meta=audit_meta,
            request_id=request_id,
        )
    )

    # Desktop sync 의 SSE nudge: node 변경이면 워크스페이스 채널에 신호.
    # fire-and-forget: redis 다운/실패가 요청을 깨뜨리지 않음. 신호일 뿐이라
    # commit 전 publish 여도 클라이언트가 delta(/changes)로 정합성 확보.
    if entity_type == "node" and workspace_id:
        try:
            from app.core.redis import get_redis

            await get_redis().publish(f"node_events:{workspace_id}", "1")
        except Exception:
            pass


# 열람 기록 (File Access). 다운로드 주소 발급 = 열람으로 본다: 바이트는 S3 에서 브라우저로
# 직접 가서 백엔드는 실제 다운로드를 볼 수 없다. entity_type 을 node 와 분리하는 이유:
# 데스크톱 싱크 변경 목록(/nodes/changes)과 활동 내역이 node 기록을 읽기 때문에, 섞으면
# 열람마다 싱크가 반응하고 활동 내역이 열람으로 덮인다. 보관 1년 (jobs/access_logs.py).
FILE_ACCESS = "file_access"
AccessKind = Literal["download", "preview", "version_download", "zip_download", "link_access"]


async def record_file_access(
    db: AsyncSession,
    node,
    *,
    actor: UserContext | None,
    kind: AccessKind,
    meta: dict | None = None,
    actor_type: str | None = None,
) -> None:
    from app.services.nodes import is_vault_content

    m = dict(meta or {})
    # 보안 폴더 파일 이름은 암호문이라 남기지 않는다 (ADR-0016).
    if await is_vault_content(db, node.id):
        m["vault"] = True
    else:
        m["name"] = node.name
    await write_audit(
        db,
        workspace_id=node.workspace_id,
        actor=actor,
        action=kind,
        entity_type=FILE_ACCESS,
        entity_id=node.id,
        meta=m,
        actor_type=actor_type,
    )
