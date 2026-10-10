"""워크스페이스 스토리지 quota: 조회, 설정, enforcement (D-3)."""

import pytest


@pytest.mark.asyncio
async def test_quota_default_unlimited(client, auth_headers):
    """row 없으면 limit=None, used=0."""
    h = auth_headers("sys", groups=["acme-corp"], roles=["admin"], active_workspace="acme-corp")
    await client.get("/api/v1/me", headers=h)
    res = await client.get("/api/v1/admin/workspaces/acme-corp/quota", headers=h)
    assert res.status_code == 200
    body = res.json()
    assert body["storage_bytes_limit"] is None
    assert body["storage_bytes_used"] == 0
    assert body["storage_pct"] is None


@pytest.mark.asyncio
async def test_quota_set_and_view(client, auth_headers, db_session):
    """System Admin 설정 → Workspace Admin 조회."""
    from app.models.user_workspace_membership import UserWorkspaceMembership

    sys_h = auth_headers("sys", groups=["acme-corp"], roles=["admin"], active_workspace="acme-corp")
    await client.get("/api/v1/me", headers=sys_h)

    # frank = acme admin
    admin_h = auth_headers("frank", groups=["acme-corp"], active_workspace="acme-corp")
    await client.get("/api/v1/me", headers=admin_h)
    m = await db_session.get(UserWorkspaceMembership, ("frank", "acme-corp"))
    m.role = "admin"
    await db_session.flush()

    # System Admin 이 10MB limit 설정
    res = await client.put(
        "/api/v1/admin/workspaces/acme-corp/quota",
        headers=sys_h,
        json={"storage_bytes_limit": 10_000_000},
    )
    assert res.status_code == 200
    assert res.json()["storage_bytes_limit"] == 10_000_000

    # Workspace Admin 이 조회
    res = await client.get(
        "/api/v1/workspaces/acme-corp/quota", headers=admin_h
    )
    assert res.status_code == 200
    body = res.json()
    assert body["storage_bytes_limit"] == 10_000_000
    assert body["storage_pct"] == 0


@pytest.mark.asyncio
async def test_upload_blocked_when_quota_exceeded(client, auth_headers, mock_storage):
    """quota=0 설정 후 새 업로드 시도 → 413."""
    sys_h = auth_headers("alice", groups=["acme-corp"], roles=["admin"], active_workspace="acme-corp")
    await client.get("/api/v1/me", headers=sys_h)

    await client.put(
        "/api/v1/admin/workspaces/acme-corp/quota",
        headers=sys_h,
        json={"storage_bytes_limit": 0},
    )

    res = await client.post(
        "/api/v1/nodes/upload-url",
        headers=sys_h,
        json={"name": "f.txt", "size": 1024, "mime": "text/plain",
              "parent_id": None, "scope": "personal"},
    )
    assert res.status_code == 413


@pytest.mark.asyncio
async def test_member_cannot_view_quota(client, auth_headers):
    h = auth_headers("user1", groups=["acme-corp"], active_workspace="acme-corp")
    await client.get("/api/v1/me", headers=h)
    res = await client.get("/api/v1/workspaces/acme-corp/quota", headers=h)
    assert res.status_code == 403
