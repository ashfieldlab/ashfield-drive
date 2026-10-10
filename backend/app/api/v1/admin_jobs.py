"""/api/v1/admin/jobs — System Admin 백그라운드 잡 관측.

등록된 cron 잡(registry.JOBS) 별로 최신 실행 + 최근 이력을 JobRun 원장에서 읽어
반환. 원장에 기록이 없는 잡은 last=null (한 번도 안 돎 — dev 워커 미기동 등).
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import require_admin
from app.core.db import get_db
from app.jobs.registry import JOBS
from app.models.job_run import JobRun

router = APIRouter(prefix="/admin/jobs", tags=["admin"])

_RECENT_LIMIT = 20


class JobRunOut(BaseModel):
    id: str
    name: str
    status: str  # running | ok | failed
    started_at: datetime
    finished_at: datetime | None
    duration_ms: int | None
    item_count: int | None
    error: str | None


class JobSummary(BaseModel):
    name: str
    schedule: str  # 사람용 스케줄 설명
    last: JobRunOut | None  # 최신 실행 (없으면 한 번도 안 돎)
    recent: list[JobRunOut]  # 최근 실행 이력 (최신순)


class JobsResponse(BaseModel):
    jobs: list[JobSummary]


@router.get("", response_model=JobsResponse)
async def list_jobs(
    _admin: UserContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> JobsResponse:
    summaries: list[JobSummary] = []
    for spec in JOBS:
        result = await db.execute(
            select(JobRun)
            .where(JobRun.name == spec.name)
            .order_by(JobRun.started_at.desc())
            .limit(_RECENT_LIMIT)
        )
        recent = [JobRunOut.model_validate(r, from_attributes=True) for r in result.scalars()]
        summaries.append(
            JobSummary(
                name=spec.name,
                schedule=spec.schedule,
                last=recent[0] if recent else None,
                recent=recent,
            )
        )
    return JobsResponse(jobs=summaries)
