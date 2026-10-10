"""recorded() — cron 잡을 JobRun 원장으로 감싸는 러너.

worker.py 등록부에서 `cron(recorded("이름", fn), ...)` 로 사용. 한 곳에서:
  1. 시작 시 status=running row INSERT (별도 트랜잭션, 즉시 commit)
  2. 잡 실행
  3. 종료 시 같은 row 를 ok/failed 로 UPDATE (duration·건수·에러 기록)

예외는 잡아서 failed 로 기록만 하고 삼킴 — 한 잡의 실패가 워커나 다른 잡을 안 죽임.
잡 함수는 그대로 (`async def fn(ctx) -> int | None`); 반환값(건수)은 item_count 로.
"""

import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from uuid import uuid4

from app.core.db import AsyncSessionLocal
from app.core.logging import logger
from app.models.job_run import JobRun

JobFn = Callable[[dict], Awaitable[int | None]]


def recorded(name: str, fn: JobFn) -> JobFn:
    """fn 을 JobRun 기록으로 감싼 arq 잡 코루틴 반환."""

    async def wrapped(ctx: dict) -> int | None:
        run_id = str(uuid4())
        t0 = time.monotonic()

        # 1) 시작 기록 — 도중에 워커가 죽어도 running 으로 남게 먼저 commit
        async with AsyncSessionLocal() as db:
            db.add(JobRun(id=run_id, name=name, status="running"))
            await db.commit()

        # 2) 실행 + 3) 종료 기록
        try:
            count = await fn(ctx)
        except Exception as exc:  # noqa: BLE001 — 실패를 원장에 남기고 삼킨다
            await _finish(run_id, "failed", t0, None, repr(exc))
            logger.error(
                "job_failed",
                extra={"category": "biz", "job": name, "error": repr(exc)},
            )
            return None

        await _finish(run_id, "ok", t0, count, None)
        return count

    # arq 는 코루틴 __name__ 으로 잡을 식별·로깅 → 원래 잡 이름 보존
    wrapped.__name__ = fn.__name__
    wrapped.__qualname__ = fn.__qualname__
    return wrapped


async def _finish(
    run_id: str, status: str, t0: float, count: int | None, error: str | None
) -> None:
    duration_ms = int((time.monotonic() - t0) * 1000)
    async with AsyncSessionLocal() as db:
        run = await db.get(JobRun, run_id)
        if run is None:
            # 방어: 시작 row 가 유실됐으면 종료 기록만이라도 남긴다
            run = JobRun(id=run_id, name="?", status=status)
            db.add(run)
        run.status = status
        run.finished_at = datetime.now(UTC)
        run.duration_ms = duration_ms
        run.item_count = count
        run.error = error
        await db.commit()
