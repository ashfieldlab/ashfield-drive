"""휴지통 자동 비우기 cron — 매일 새벽.

settings.trash_retention_days(기본 30) 보다 오래된 soft-deleted 노드를 hard-delete +
자손 트리 S3 object 정리. 회사 단위 X, 전역 sweep.

API 라우트 empty_trash 의 cron 버전 — 권한 체크/감사 actor 없이 시스템 sweep.
세부 로직(자손 트리 + S3 정리)은 같은 패턴 재사용.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.core.logging import logger
from app.models.node import Node
from app.services.nodes import purge_subtree_storage


async def purge_expired_trash(ctx: dict) -> int:
    """retention 지난 soft-deleted 노드를 hard delete. 발견·삭제한 top-level 노드 수 반환."""
    cutoff = datetime.now(UTC) - timedelta(days=settings.trash_retention_days)

    async with AsyncSessionLocal() as db:
        nodes = (
            await db.execute(
                select(Node).where(
                    Node.deleted_at.is_not(None),
                    Node.deleted_at < cutoff,
                )
            )
        ).scalars().all()
        if not nodes:
            return 0

        storage_deleted = await purge_subtree_storage(db, [n.id for n in nodes])
        for n in nodes:
            await db.delete(n)
        await db.commit()

        logger.info(
            "trash_cron_purged",
            extra={
                "category": "biz",
                "nodes": len(nodes),
                "storage_objects": storage_deleted,
                "retention_days": settings.trash_retention_days,
            },
        )
        return len(nodes)


async def purge_expired_versions(ctx: dict) -> int:
    """30일 지난 파일 버전 삭제 (ADR-0022). 삭제 건수 반환."""
    from app.services import file_versions

    async with AsyncSessionLocal() as db:
        keys = await file_versions.purge_expired(db, now=datetime.now(UTC))
        await db.commit()
    await file_versions.delete_objects(keys)
    if keys:
        logger.info("file_versions_expired", extra={"category": "biz", "count": len(keys)})
    return len(keys)
