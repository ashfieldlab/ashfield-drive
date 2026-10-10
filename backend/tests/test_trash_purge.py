"""휴지통: 골라서 영구 삭제 (POST /nodes/trash/purge) + 보존 기간 노출."""

from httpx import AsyncClient
from sqlalchemy import select

from app.models.audit_log import AuditLog
from app.models.node import Node

ALICE = "user-alice"
BOB = "user-bob"
ACME = "tenant-a"
OTHER = "tenant-b"


async def _upload(client, h, name, parent_id=None, scope="personal"):
    r = await client.post(
        "/api/v1/nodes/upload-url",
        json={"name": name, "size": 3, "mime": "text/plain", "parent_id": parent_id, "scope": scope},
        headers=h,
    )
    assert r.status_code == 200, r.text
    nid = r.json()["node_id"]
    assert (await client.post(f"/api/v1/nodes/{nid}/complete", headers=h)).status_code == 200
    return nid


async def _folder(client, h, name, parent_id=None, scope="personal"):
    r = await client.post(
        "/api/v1/nodes", json={"name": name, "parent_id": parent_id, "scope": scope}, headers=h
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _trash_ids(client, h) -> set[str]:
    r = await client.get("/api/v1/nodes/trash", headers=h)
    assert r.status_code == 200
    return {n["id"] for n in r.json()["nodes"]}


async def test_trash_exposes_retention_days(client: AsyncClient, auth_headers, mock_storage):
    from app.core.config import settings

    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    body = (await client.get("/api/v1/nodes/trash", headers=h)).json()
    assert body["retention_days"] == settings.trash_retention_days


async def test_purge_selected_only(
    client: AsyncClient, auth_headers, mock_storage, db_session
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    a = await _upload(client, h, "a.txt")
    b = await _upload(client, h, "b.txt")
    for nid in (a, b):
        assert (await client.delete(f"/api/v1/nodes/{nid}", headers=h)).status_code == 204
    assert f"{ACME}/{a}" in mock_storage

    r = await client.post("/api/v1/nodes/trash/purge", json={"ids": [a]}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json() == {"purged": 1}

    assert await _trash_ids(client, h) == {b}
    assert f"{ACME}/{a}" not in mock_storage  # S3 객체 삭제
    assert f"{ACME}/{b}" in mock_storage
    assert await db_session.get(Node, a) is None

    audit = (
        await db_session.execute(
            select(AuditLog).where(AuditLog.entity_id == a, AuditLog.action == "delete")
        )
    ).scalars().all()
    assert any(x.meta.get("permanent") is True for x in audit)


async def test_purge_folder_removes_descendants(
    client: AsyncClient, auth_headers, mock_storage, db_session
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    box = await _folder(client, h, "box")
    inner = await _upload(client, h, "inner.txt", parent_id=box)
    await client.delete(f"/api/v1/nodes/{box}", headers=h)
    assert await _trash_ids(client, h) == {box, inner}

    # 자손 id 가 같이 와도 한 항목으로 센다
    r = await client.post("/api/v1/nodes/trash/purge", json={"ids": [box, inner]}, headers=h)
    assert r.json() == {"purged": 1}
    assert await _trash_ids(client, h) == set()
    assert f"{ACME}/{inner}" not in mock_storage
    db_session.expire_all()
    assert await db_session.get(Node, inner) is None


async def test_purge_ignores_active_and_foreign_nodes(
    client: AsyncClient, auth_headers, mock_storage
):
    a = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    b = auth_headers(BOB, groups=[ACME], active_workspace=ACME)
    o = auth_headers(ALICE, groups=[ACME, OTHER], active_workspace=OTHER)

    active = await _upload(client, a, "live.txt")
    alice_private = await _upload(client, a, "private.txt")
    await client.delete(f"/api/v1/nodes/{alice_private}", headers=a)
    other_ws = await _upload(client, o, "other.txt")
    await client.delete(f"/api/v1/nodes/{other_ws}", headers=o)

    # Bob 은 Alice 의 개인 휴지통 항목을 지울 수 없다
    r = await client.post(
        "/api/v1/nodes/trash/purge", json={"ids": [alice_private, active]}, headers=b
    )
    assert r.json() == {"purged": 0}
    # 다른 워크스페이스 항목과 활성 노드는 무시
    r = await client.post(
        "/api/v1/nodes/trash/purge", json={"ids": [other_ws, active]}, headers=a
    )
    assert r.json() == {"purged": 0}
    assert alice_private in await _trash_ids(client, a)
    assert other_ws in await _trash_ids(client, o)
    tree = (await client.get("/api/v1/nodes/tree?scope=personal", headers=a)).json()
    assert active in {n["id"] for n in tree["nodes"]}


async def test_purge_shared_trash_by_member(client: AsyncClient, auth_headers, mock_storage):
    a = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    b = auth_headers(BOB, groups=[ACME], active_workspace=ACME)
    nid = await _upload(client, a, "team.txt", scope="shared")
    await client.delete(f"/api/v1/nodes/{nid}", headers=a)
    # 워크스페이스 휴지통은 공통: 휴지통 비우기와 같은 규칙
    r = await client.post("/api/v1/nodes/trash/purge", json={"ids": [nid]}, headers=b)
    assert r.json() == {"purged": 1}


async def test_purge_requires_ids(client: AsyncClient, auth_headers, mock_storage):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    r = await client.post("/api/v1/nodes/trash/purge", json={"ids": []}, headers=h)
    assert r.status_code == 422
    r = await client.post("/api/v1/nodes/trash/purge", json={"ids": ["x"]})
    assert r.status_code == 401
