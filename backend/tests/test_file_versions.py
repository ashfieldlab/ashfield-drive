"""파일 버전 (ADR-0022).

mock_storage 는 모든 업로드를 123 바이트로 기록한다. 한도 값은 123 의 배수로 맞춘다.
"""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.company_quota import CompanyQuota
from app.models.file_version import FileVersion
from app.services import file_versions

pytestmark = pytest.mark.asyncio

ALICE = "user-alice"
BOB = "user-bob"
ACME = "tenant-a"
SIZE = 123


@pytest.fixture
def no_coalesce(monkeypatch):
    """같은 사람이 연달아 저장해도 매번 버전이 남게 (묶기 창 0)."""
    monkeypatch.setattr(file_versions, "COALESCE_WINDOW", timedelta(0))


async def _file(client, h, name="doc.txt", scope="personal") -> str:
    r = await client.post(
        "/api/v1/nodes/upload-url",
        json={"name": name, "size": 1, "mime": None, "scope": scope},
        headers=h,
    )
    assert r.status_code == 200, r.text
    node_id = r.json()["node_id"]
    r = await client.post(f"/api/v1/nodes/{node_id}/complete", headers=h)
    assert r.status_code == 200, r.text
    return node_id


async def _overwrite(client, h, node_id) -> dict:
    r = await client.post(f"/api/v1/nodes/{node_id}/overwrite-url", json={"size": 1}, headers=h)
    assert r.status_code == 200, r.text
    r = await client.post(f"/api/v1/nodes/{node_id}/overwrite-complete", json={}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


async def _versions(client, h, node_id) -> list[dict]:
    r = await client.get(f"/api/v1/nodes/{node_id}/versions", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


async def _set_quota(db, limit: int) -> None:
    db.add(CompanyQuota(company_id=ACME, storage_bytes_limit=limit))
    await db.flush()


async def test_overwrite_keeps_old_content_as_version(
    client: AsyncClient, auth_headers, mock_storage, no_coalesce
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    node_id = await _file(client, h)
    await _overwrite(client, h, node_id)

    versions = await _versions(client, h, node_id)
    assert len(versions) == 1
    assert versions[0]["saved_by"] == ALICE
    assert versions[0]["size_bytes"] == SIZE
    # 옛 객체는 지워지지 않고 버전이 붙든다
    r = await client.post(
        f"/api/v1/nodes/{node_id}/versions/{versions[0]['id']}/download-url", headers=h
    )
    assert r.status_code == 200
    old_key = r.json()["url"].removeprefix("http://mock-s3/get/")
    assert old_key in mock_storage


async def test_same_person_within_window_coalesces(
    client: AsyncClient, auth_headers, mock_storage
):
    """10분 안에 같은 사람이 다시 저장하면 버전 없음, 옛 객체는 정리."""
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    node_id = await _file(client, h)
    keys_before = {k for k in mock_storage if not k.startswith(("mpu:", "body:"))}
    await _overwrite(client, h, node_id)
    await _overwrite(client, h, node_id)

    assert await _versions(client, h, node_id) == []
    keys_after = {k for k in mock_storage if not k.startswith(("mpu:", "body:"))}
    assert not (keys_before & keys_after)  # 처음 올린 객체는 지워짐
    assert len(keys_after) == 1


async def test_other_person_save_is_never_coalesced(
    client: AsyncClient, auth_headers, mock_storage
):
    """같은 사람 기준이라, 다른 사람이 곧바로 덮어써도 직전 내용은 버전으로 남는다."""
    a = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    b = auth_headers(BOB, groups=[ACME], active_company=ACME)
    node_id = await _file(client, a, scope="shared")
    await _overwrite(client, b, node_id)

    versions = await _versions(client, a, node_id)
    assert [v["saved_by"] for v in versions] == [ALICE]


async def test_restore_swaps_current_and_version(
    client: AsyncClient, auth_headers, mock_storage, no_coalesce
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    node_id = await _file(client, h)
    await _overwrite(client, h, node_id)
    [v1] = await _versions(client, h, node_id)

    r = await client.post(f"/api/v1/nodes/{node_id}/versions/{v1['id']}/restore", headers=h)
    assert r.status_code == 200, r.text

    versions = await _versions(client, h, node_id)
    # 복원한 버전은 현재가 되어 목록에서 빠지고, 직전 현재 내용이 새 버전으로 남는다
    assert len(versions) == 1
    assert versions[0]["id"] != v1["id"]
    # 싱크가 내용 변경을 알아채도록 노드 update 감사 기록이 남는다
    since = (datetime.now(UTC) - timedelta(minutes=5)).isoformat()
    r = await client.get("/api/v1/nodes/changes", params={"since": since}, headers=h)
    actions = [c["action"] for c in r.json()["changes"] if c["node_id"] == node_id]
    assert actions.count("update") == 2  # 덮어쓰기 + 복원


async def test_restore_then_quick_save_keeps_restored_content(
    client: AsyncClient, auth_headers, mock_storage
):
    """복원 직후 같은 사람이 저장해도 묶기에 걸려 복원해 온 내용이 버려지면 안 된다."""
    a = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    b = auth_headers(BOB, groups=[ACME], active_company=ACME)
    node_id = await _file(client, a, scope="shared")
    await _overwrite(client, b, node_id)  # ALICE 내용이 버전으로
    [v1] = await _versions(client, a, node_id)

    await client.post(f"/api/v1/nodes/{node_id}/versions/{v1['id']}/restore", headers=a)
    await _overwrite(client, a, node_id)  # 복원 직후 ALICE 가 다시 저장

    saved_by = sorted(v["saved_by"] for v in await _versions(client, a, node_id))
    assert saved_by == [ALICE, BOB]  # 복원해 온 ALICE 내용도 버전으로 남음


async def test_permissions_read_write_manage(
    client: AsyncClient, auth_headers, mock_storage, no_coalesce
):
    a = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    b = auth_headers(BOB, groups=[ACME], active_company=ACME)
    node_id = await _file(client, a)
    await _overwrite(client, a, node_id)
    [v1] = await _versions(client, a, node_id)

    await client.get("/api/v1/me", headers=b)  # 첫 요청이 BOB 사용자 행을 만든다 (공유 FK)
    # 읽기 공유: 버전 못 봄 (지운 내용이 새지 않게)
    await client.post(
        f"/api/v1/nodes/{node_id}/shares",
        json={"grantee_sub": BOB, "permission": "read"},
        headers=a,
    )
    r = await client.get(f"/api/v1/nodes/{node_id}/versions", headers=b)
    assert r.status_code == 403

    # 쓰기 공유: 열람 가능, 삭제는 불가(관리 권한)
    await client.post(
        f"/api/v1/nodes/{node_id}/shares",
        json={"grantee_sub": BOB, "permission": "write"},
        headers=a,
    )
    assert len(await _versions(client, b, node_id)) == 1
    r = await client.delete(f"/api/v1/nodes/{node_id}/versions/{v1['id']}", headers=b)
    assert r.status_code == 403

    r = await client.delete(f"/api/v1/nodes/{node_id}/versions/{v1['id']}", headers=a)
    assert r.status_code == 204
    assert await _versions(client, a, node_id) == []


async def test_cap_per_file(
    client: AsyncClient, auth_headers, mock_storage, no_coalesce, monkeypatch
):
    monkeypatch.setattr(file_versions, "MAX_PER_FILE", 2)
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    node_id = await _file(client, h)
    for _ in range(4):
        await _overwrite(client, h, node_id)
    assert len(await _versions(client, h, node_id)) == 2


async def test_quota_prunes_versions_instead_of_blocking(
    client: AsyncClient, auth_headers, mock_storage, no_coalesce, db_session
):
    """한도가 차도 저장은 성공하고, 버전이 지워져 자리를 만든다."""
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    node_id = await _file(client, h)  # 첫 요청이 회사 행을 만든다 (한도 FK)
    await _set_quota(db_session, SIZE * 2)  # 파일 1 + 버전 1
    await _overwrite(client, h, node_id)
    await _overwrite(client, h, node_id)  # 버전 2개째 → 한도 초과 → 가장 오래된 것 정리

    assert len(await _versions(client, h, node_id)) == 1


async def test_quota_prunes_saving_file_first(
    client: AsyncClient, auth_headers, mock_storage, no_coalesce, db_session
):
    """다른 파일의 더 오래된 버전보다, 저장 중인 그 파일의 버전을 먼저 지운다."""
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    file_a = await _file(client, h, name="a.txt")
    await _overwrite(client, h, file_a)  # A 버전 (가장 오래됨)
    file_b = await _file(client, h, name="b.txt")
    await _overwrite(client, h, file_b)  # B 버전
    await _set_quota(db_session, SIZE * 4)  # 지금 딱 4개 분량
    await _overwrite(client, h, file_b)  # B 버전 하나 더 → 초과

    assert len(await _versions(client, h, file_a)) == 1
    assert len(await _versions(client, h, file_b)) == 1


async def test_hard_delete_removes_version_objects(
    client: AsyncClient, auth_headers, mock_storage, no_coalesce
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    node_id = await _file(client, h)
    await _overwrite(client, h, node_id)
    [v1] = await _versions(client, h, node_id)
    r = await client.post(f"/api/v1/nodes/{node_id}/versions/{v1['id']}/download-url", headers=h)
    version_key = r.json()["url"].removeprefix("http://mock-s3/get/")

    await client.delete(f"/api/v1/nodes/{node_id}", headers=h)  # 휴지통
    assert version_key in mock_storage  # 휴지통에선 버전도 보관
    r = await client.delete("/api/v1/nodes/trash", headers=h)  # 영구 삭제
    assert r.status_code == 200, r.text
    assert version_key not in mock_storage


async def test_expired_versions_purged(
    client: AsyncClient, auth_headers, mock_storage, no_coalesce, db_session
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    node_id = await _file(client, h)
    await _overwrite(client, h, node_id)

    keys = await file_versions.purge_expired(db_session, now=datetime.now(UTC) + timedelta(days=29))
    assert keys == []
    keys = await file_versions.purge_expired(db_session, now=datetime.now(UTC) + timedelta(days=31))
    assert len(keys) == 1
    left = (await db_session.scalars(select(FileVersion))).all()
    assert left == []


async def test_my_storage_includes_versions(
    client: AsyncClient, auth_headers, mock_storage, no_coalesce
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    node_id = await _file(client, h)
    await _overwrite(client, h, node_id)
    r = await client.get("/api/v1/me/storage", headers=h)
    body = r.json()
    assert body["storage_bytes_used"] == SIZE * 2
    assert body["version_bytes_used"] == SIZE
