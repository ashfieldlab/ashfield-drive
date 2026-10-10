"""/api/v1/me/activity — 본인 행동 + 본인 알림 entity 만 노출."""

from httpx import AsyncClient

ALICE = "user-alice"
BOB = "user-bob"
ACME = "tenant-a"


async def _ensure(client, auth_headers, sub):
    await client.get(
        "/api/v1/me",
        headers=auth_headers(sub, groups=[ACME], active_company=ACME),
    )


async def test_activity_shows_self_actions(
    client: AsyncClient, auth_headers, mock_storage
):
    a = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    node = (await client.post("/api/v1/nodes", json={"name": "f"}, headers=a)).json()
    await client.delete(f"/api/v1/nodes/{node['id']}", headers=a)

    r = await client.get("/api/v1/me/activity", headers=a)
    assert r.status_code == 200
    items = r.json()["items"]
    assert any(
        it["action"] == "create" and it["entity_id"] == node["id"] for it in items
    )
    assert any(
        it["action"] == "delete" and it["entity_id"] == node["id"] for it in items
    )


async def test_activity_empty_for_fresh_user(client: AsyncClient, auth_headers):
    fresh = auth_headers("user-fresh", groups=[ACME], active_company=ACME)
    r = await client.get("/api/v1/me/activity", headers=fresh)
    assert r.status_code == 200
    assert r.json()["items"] == []


async def test_activity_shows_received_share(
    client: AsyncClient, auth_headers, mock_storage
):
    await _ensure(client, auth_headers, BOB)
    a = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    b = auth_headers(BOB, groups=[ACME], active_company=ACME)
    node = (await client.post("/api/v1/nodes", json={"name": "g"}, headers=a)).json()
    await client.post(
        f"/api/v1/nodes/{node['id']}/shares",
        json={"grantee_sub": BOB, "permission": "read"},
        headers=a,
    )
    # Bob 의 activity 에는 본인이 한 일이 없지만 받은 알림 entity = node['id'] 매칭으로
    # Alice 의 share audit row 가 노출되어야 함
    r = await client.get("/api/v1/me/activity", headers=b)
    items = r.json()["items"]
    assert any(
        it["action"] == "share" and it["entity_id"] == node["id"] for it in items
    )
