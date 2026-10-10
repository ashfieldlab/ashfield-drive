"""열람 기록 보관기간 정리: 1년 지난 file_access 감사 기록 삭제.

생성, 수정, 삭제 기록은 영구 보관, 열람만 1년 (개인정보 안전성 확보조치의 접속기록 1년 기준).
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import AsyncSessionLocal
from app.models.audit_log import AuditLog
from app.services.audit import FILE_ACCESS

ACCESS_LOG_RETENTION = timedelta(days=365)


async def purge_access_logs(db: AsyncSession, *, now: datetime) -> int:
    result = await db.execute(
        delete(AuditLog)
        .where(AuditLog.entity_type == FILE_ACCESS, AuditLog.created_at < now - ACCESS_LOG_RETENTION)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount or 0


async def purge_expired_access_logs(ctx: dict) -> int:
    async with AsyncSessionLocal() as db:
        n = await purge_access_logs(db, now=datetime.now(UTC))
        await db.commit()
        return n
