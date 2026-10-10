"""/api/v1/admin/jobs — System Admin 잡 관측 엔드포인트.

admin 전용 + 등록된 잡(registry.JOBS) 전부를 최신/최근 실행과 함께 반환.
원장에 기록 없는 잡은 last=null.
"""

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.jobs.registry import JOBS
from app.models.job_run import JobRun

ALICE = "user-alice"
ADMIN = "user-admin"
ACME = "tenant-a"


@pytest.mark.asyncio
async def test_non_admin_forbidden(client: AsyncClient, auth_headers):
    r = await client.get("/api/v1/admin/jobs", headers=auth_headers(ALICE, groups=[ACME]))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_lists_all_registered_jobs_even_without_runs(client: AsyncClient, auth_headers):
    admin = auth_headers(ADMIN, groups=[ACME], roles=["admin"])
    r = await client.get("/api/v1/admin/jobs", headers=admin)
    assert r.status_code == 200

    jobs = r.json()["jobs"]
    # 등록표의 모든 잡이, 실행 기록이 없어도 표시된다
    assert [j["name"] for j in jobs] == [s.name for s in JOBS]
    for j in jobs:
        assert j["last"] is None
        assert j["recent"] == []
        assert j["schedule"]  # 사람용 스케줄 설명 존재


@pytest.mark.asyncio
async def test_reflects_recorded_run(
    client: AsyncClient, auth_headers, db_session: AsyncSession
):
    db_session.add(
        JobRun(
            id="run-1",
            name="trash_purge",
            status="ok",
            started_at=datetime(2026, 7, 11, 4, 0, tzinfo=UTC),
            finished_at=datetime(2026, 7, 11, 4, 0, 2, tzinfo=UTC),
            duration_ms=2000,
            item_count=5,
        )
    )
    await db_session.flush()

    admin = auth_headers(ADMIN, groups=[ACME], roles=["admin"])
    r = await client.get("/api/v1/admin/jobs", headers=admin)
    assert r.status_code == 200

    trash = next(j for j in r.json()["jobs"] if j["name"] == "trash_purge")
    assert trash["last"]["status"] == "ok"
    assert trash["last"]["item_count"] == 5
    assert trash["last"]["duration_ms"] == 2000
    assert len(trash["recent"]) == 1
