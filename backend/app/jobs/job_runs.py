"""purge_expired_job_runs — JobRun 원장 보존기간 정리 cron.

settings.job_run_retention_days 초과한 실행 기록을 삭제. 이 잡 자신도
recorded() 를 거치므로 원장에 한 줄 남는다 (자기참조).
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.models.job_run import JobRun


async def purge_expired_job_runs(ctx: dict) -> int:
    """retention 지난 JobRun 삭제. 삭제 건수 반환."""
    cutoff = datetime.now(UTC) - timedelta(days=settings.job_run_retention_days)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            delete(JobRun)
            .where(JobRun.started_at < cutoff)
            .execution_options(synchronize_session=False)
        )
        await db.commit()
        return result.rowcount or 0
