"""열람 기록 — 다운로드 주소 발급 = 열람. 싱크 변경 목록·활동 내역엔 안 섞인다."""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.jobs.access_logs import purge_access_logs
from app.models.audit_log import AuditLog

pytestmark = pytest.mark.asyncio

ALICE = "user-alice"
ACME = "tenant-a"


async def _file(client, h, name="a.pdf") -> str:
    r = await client.post(
        "/api/v1/nodes/upload-url", json={"name": name, "size": 1, "mime": None}, headers=h
    )
    node_id = r.json()["node_id"]
    await client.post(f"/api/v1/nodes/{node_id}/complete", headers=h)
    return node_id


async def _access_rows(db, node_id) -> list[AuditLog]:
    return list(
        (
            await db.scalars(
                select(AuditLog)
                .where(AuditLog.entity_type == "file_access", AuditLog.entity_id == node_id)
                .order_by(AuditLog.created_at)
            )
        ).all()
    )


async def test_download_and_preview_are_recorded(
    client: AsyncClient, auth_headers, mock_storage, db_session
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    node_id = await _file(client, h)
    await client.post(f"/api/v1/nodes/{node_id}/download-url", headers=h)
    await client.post(f"/api/v1/nodes/{node_id}/download-url?purpose=preview", headers=h)

    rows = await _access_rows(db_session, node_id)
    assert [r.action for r in rows] == ["download", "preview"]
    assert rows[0].actor_sub == ALICE
    assert rows[0].meta["name"] == "a.pdf"


async def test_access_not_in_sync_changes_or_activity(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    node_id = await _file(client, h)
    for _ in range(3):
        await client.post(f"/api/v1/nodes/{node_id}/download-url", headers=h)

    since = (datetime.now(UTC) - timedelta(minutes=5)).isoformat()
    r = await client.get("/api/v1/nodes/changes", params={"since": since}, headers=h)
    assert all(c["action"] not in ("download", "preview") for c in r.json()["changes"])

    r = await client.get("/api/v1/me/activity", headers=h)
    assert all(i["entity_type"] != "file_access" for i in r.json()["items"])


async def test_zip_download_recorded(
    client: AsyncClient, auth_headers, mock_storage, db_session
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    folder = (await client.post("/api/v1/nodes", json={"name": "Dir"}, headers=h)).json()["id"]
    r = await client.get(f"/api/v1/nodes/{folder}/zip", headers=h)
    assert r.status_code == 200, r.text
    assert [r.action for r in await _access_rows(db_session, folder)] == ["zip_download"]


async def test_external_link_access_recorded_with_ip(
    client: AsyncClient, auth_headers, mock_storage, db_session
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    node_id = await _file(client, h)
    r = await client.post(
        f"/api/v1/nodes/{node_id}/external-links", json={"permission": "read"}, headers=h
    )
    token = r.json()["token"]
    r = await client.post(
        f"/s/{token}/download", json={}, headers={"X-Forwarded-For": "203.0.113.7, 10.0.0.1"}
    )
    assert r.status_code == 200

    [row] = await _access_rows(db_session, node_id)
    assert row.action == "link_access"
    assert row.actor_type == "public"
    assert row.actor_sub is None
    assert row.meta["ip"] == "203.0.113.7"


async def test_access_logs_kept_one_year(
    client: AsyncClient, auth_headers, mock_storage, db_session
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    node_id = await _file(client, h)
    await client.post(f"/api/v1/nodes/{node_id}/download-url", headers=h)

    now = datetime.now(UTC)
    assert await purge_access_logs(db_session, now=now + timedelta(days=364)) == 0
    assert await purge_access_logs(db_session, now=now + timedelta(days=366)) == 1
    # 생성 기록(node create)은 그대로 남는다
    created = await db_session.scalar(
        select(AuditLog).where(AuditLog.entity_type == "node", AuditLog.entity_id == node_id)
    )
    assert created is not None
