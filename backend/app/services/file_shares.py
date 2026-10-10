"""FileShare 도메인.

생성·삭제는 node.owner_id 만 (Phase 1.5 단순 모델). manage 권한 분리는 Phase 2.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.models.file_share import FileShare
from app.models.node import Node
from app.models.user import User
from app.services.nodes import _PERM_RANK, effective_permission


async def assert_can_manage_shares(
    db: AsyncSession, node: Node, *, user: UserContext
) -> None:
    """공유 생성/삭제 권한 — 소유자 또는 'manage' permission 보유자.

    Phase 1.5 (소유자 only) 에서 확장 — Phase 2e ADR-0008 정밀화.
    """
    if node.owner_id == user.sub:
        return
    rank = await effective_permission(
        db, node, user=user, company_id=node.company_id
    )
    if rank < _PERM_RANK["manage"]:
        raise HTTPException(403, "Manage permission required")


async def list_shares_for_node(
    db: AsyncSession, *, node_id: str
) -> list[tuple[FileShare, User | None]]:
    stmt = (
        select(FileShare, User)
        .outerjoin(User, User.id == FileShare.grantee_sub)
        .where(FileShare.node_id == node_id)
        .order_by(FileShare.granted_at.desc())
    )
    return [(s, u) for s, u in (await db.execute(stmt)).all()]


async def upsert_share(
    db: AsyncSession,
    *,
    node: Node,
    grantee_sub: str,
    permission: str,
    granted_by_sub: str,
    expires_at: datetime | None,
) -> FileShare:
    if grantee_sub == node.owner_id:
        raise HTTPException(400, "Cannot share to owner")
    stmt = select(FileShare).where(
        and_(FileShare.node_id == node.id, FileShare.grantee_sub == grantee_sub)
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        existing.permission = permission  # type: ignore[assignment]
        existing.granted_by_sub = granted_by_sub
        existing.expires_at = expires_at
        return existing
    share = FileShare(
        id=str(uuid.uuid7()),
        node_id=node.id,
        grantee_sub=grantee_sub,
        permission=permission,  # type: ignore[arg-type]
        granted_by_sub=granted_by_sub,
        expires_at=expires_at,
    )
    db.add(share)
    return share


async def upsert_group_share(
    db: AsyncSession,
    *,
    node: Node,
    group_id: str,
    permission: str,
    granted_by_sub: str,
    expires_at: datetime | None,
) -> FileShare:
    """그룹(= 디렉터리 부서) 공유. group_id 는 directory department_id (외부 참조)."""
    stmt = select(FileShare).where(
        and_(
            FileShare.node_id == node.id,
            FileShare.grantee_group_id == group_id,
        )
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        existing.permission = permission  # type: ignore[assignment]
        existing.granted_by_sub = granted_by_sub
        existing.expires_at = expires_at
        return existing
    share = FileShare(
        id=str(uuid.uuid7()),
        node_id=node.id,
        grantee_group_id=group_id,
        permission=permission,  # type: ignore[arg-type]
        granted_by_sub=granted_by_sub,
        expires_at=expires_at,
    )
    db.add(share)
    return share


async def get_share_or_404(db: AsyncSession, share_id: str) -> FileShare:
    s = await db.get(FileShare, share_id)
    if s is None:
        raise HTTPException(404, "Share not found")
    return s
