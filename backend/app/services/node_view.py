"""Node -> NodeResponse 변환 + 목록 표시용 부가 정보.

share_count (만료 안 된 FileShare 수), has_link (활성 외부 링크 존재),
content_updated_by_name (현재 내용 저장자 표시명). 목록 하나에 쿼리 3개로
한꺼번에 채운다 (노드마다 조회하는 N+1 금지).
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.external_link import ExternalLink
from app.models.file_share import FileShare
from app.models.node import Node
from app.models.user import User
from app.schemas.node import NodeResponse


async def to_responses(db: AsyncSession, nodes: Sequence[Node]) -> list[NodeResponse]:
    if not nodes:
        return []
    ids = [n.id for n in nodes]
    now = datetime.now(UTC)

    share_counts: dict[str, int] = {
        node_id: count
        for node_id, count in (
            await db.execute(
                select(FileShare.node_id, func.count())
                .where(
                    FileShare.node_id.in_(ids),
                    or_(FileShare.expires_at.is_(None), FileShare.expires_at > now),
                )
                .group_by(FileShare.node_id)
            )
        ).all()
    }
    linked: set[str] = set(
        (
            await db.execute(
                select(ExternalLink.node_id)
                .where(
                    ExternalLink.node_id.in_(ids),
                    ExternalLink.revoked_at.is_(None),
                    or_(ExternalLink.expires_at.is_(None), ExternalLink.expires_at > now),
                )
                .distinct()
            )
        )
        .scalars()
        .all()
    )
    savers = {n.content_updated_by for n in nodes if n.content_updated_by}
    names: dict[str, str] = {}
    if savers:
        for uid, name, email in (
            await db.execute(
                select(User.id, User.name, User.email).where(User.id.in_(savers))
            )
        ).all():
            names[uid] = name or email

    out: list[NodeResponse] = []
    for n in nodes:
        r = NodeResponse.model_validate(n, from_attributes=True)
        r.share_count = share_counts.get(n.id, 0)
        r.has_link = n.id in linked
        if n.content_updated_by:
            r.content_updated_by_name = names.get(n.content_updated_by)
        out.append(r)
    return out


async def to_response(db: AsyncSession, node: Node) -> NodeResponse:
    return (await to_responses(db, [node]))[0]
