"""recorded() 러너: JobRun 원장 기록 검증.

잡을 러너로 감싸면 성공/실패가 원장에 남고, 실패는 삼켜져 워커를 안 죽인다.
러너가 내부에서 여는 AsyncSessionLocal 을 테스트 트랜잭션으로 monkeypatch
(conftest 의 webhook 디스패처 패턴과 동일).
"""

import contextlib

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.jobs.runner import recorded
from app.models.job_run import JobRun


@pytest_asyncio.fixture
async def patched_runner(db_session, monkeypatch):
    @contextlib.asynccontextmanager
    async def fake_factory():
        yield db_session

    import app.jobs.runner as runner_mod

    monkeypatch.setattr(runner_mod, "AsyncSessionLocal", fake_factory)
    return db_session


async def _runs(db, name: str) -> list[JobRun]:
    result = await db.execute(select(JobRun).where(JobRun.name == name))
    return list(result.scalars().all())


@pytest.mark.asyncio
async def test_success_records_ok_with_count(patched_runner):
    db = patched_runner

    async def job(ctx: dict) -> int:
        return 7

    result = await recorded("ok_job", job)({})

    assert result == 7
    runs = await _runs(db, "ok_job")
    assert len(runs) == 1
    run = runs[0]
    assert run.status == "ok"
    assert run.item_count == 7
    assert run.finished_at is not None
    assert run.duration_ms is not None
    assert run.error is None


@pytest.mark.asyncio
async def test_failure_records_failed_and_is_swallowed(patched_runner):
    db = patched_runner

    async def boom(ctx: dict) -> int:
        raise ValueError("kaboom")

    # 예외가 전파되지 않아야 한다 (워커·다른 잡 보호)
    result = await recorded("boom_job", boom)({})

    assert result is None
    runs = await _runs(db, "boom_job")
    assert len(runs) == 1
    run = runs[0]
    assert run.status == "failed"
    assert run.error is not None and "kaboom" in run.error
    assert run.finished_at is not None
    assert run.item_count is None


@pytest.mark.asyncio
async def test_none_return_records_ok(patched_runner):
    db = patched_runner

    async def quiet(ctx: dict) -> None:
        return None

    result = await recorded("quiet_job", quiet)({})

    assert result is None
    run = (await _runs(db, "quiet_job"))[0]
    assert run.status == "ok"
    assert run.item_count is None
    assert run.error is None
