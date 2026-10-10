"""GET /api/v1/me — 가장 단순한 인증 경로 검증."""

import pytest


@pytest.mark.asyncio
async def test_me_requires_auth(client):
    res = await client.get("/api/v1/me")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_user_context(client, auth_headers):
    headers = auth_headers("alice", groups=["acme-corp"], roles=["admin"])
    res = await client.get("/api/v1/me", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["sub"] == "alice"
    assert body["groups"] == ["acme-corp"]
    assert body["roles"] == ["admin"]
    assert body["is_system_admin"] is True


@pytest.mark.asyncio
async def test_me_non_admin(client, auth_headers):
    headers = auth_headers("bob", groups=["beta-co"])
    res = await client.get("/api/v1/me", headers=headers)
    assert res.status_code == 200
    assert res.json()["is_system_admin"] is False


@pytest.mark.asyncio
async def test_me_company_roles_default_member(client, auth_headers):
    """첫 로그인 → lazy upsert 가 멤버십 row 만듦 → default role='member'."""
    headers = auth_headers("carol", groups=["acme-corp"])
    res = await client.get("/api/v1/me", headers=headers)
    body = res.json()
    assert body["company_roles"] == {"acme-corp": "member"}
