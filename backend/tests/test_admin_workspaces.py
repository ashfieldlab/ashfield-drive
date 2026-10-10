"""/api/v1/admin/workspaces: System Admin 워크스페이스·멤버 관리 (ADR-0010)."""

import pytest


@pytest.mark.asyncio
async def test_list_workspaces_requires_system_admin(client, auth_headers):
    headers = auth_headers("eve", groups=["acme-corp"])
    res = await client.get("/api/v1/admin/workspaces", headers=headers)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_member_role_lifecycle(client, auth_headers):
    """System Admin 이 멤버 role 을 member → admin → member 로 변경할 수 있다."""
    sys_h = auth_headers("sys", groups=["acme-corp"], roles=["admin"])
    user_h = auth_headers("user1", groups=["acme-corp"])

    # user1 의 lazy upsert 발생: default role='member'
    await client.get("/api/v1/me", headers=user_h)

    # 워크스페이스 목록
    res = await client.get("/api/v1/admin/workspaces", headers=sys_h)
    assert res.status_code == 200
    items = {c["id"]: c for c in res.json()["workspaces"]}
    assert "acme-corp" in items
    assert items["acme-corp"]["admin_count"] == 0

    # admin 임명
    res = await client.patch(
        "/api/v1/admin/workspaces/acme-corp/members/user1",
        headers=sys_h,
        json={"role": "admin"},
    )
    assert res.status_code == 200
    assert res.json()["role"] == "admin"

    # 멤버 목록 확인
    res = await client.get(
        "/api/v1/admin/workspaces/acme-corp/members", headers=sys_h
    )
    assert res.status_code == 200
    members = {m["user_sub"]: m for m in res.json()["members"]}
    assert members["user1"]["role"] == "admin"

    # 강등
    res = await client.patch(
        "/api/v1/admin/workspaces/acme-corp/members/user1",
        headers=sys_h,
        json={"role": "member"},
    )
    assert res.status_code == 200
    assert res.json()["role"] == "member"


@pytest.mark.asyncio
async def test_member_role_unknown_membership(client, auth_headers):
    sys_h = auth_headers("sys", groups=["acme-corp"], roles=["admin"])
    await client.get("/api/v1/me", headers=sys_h)  # acme-corp 워크스페이스 row 생성
    res = await client.patch(
        "/api/v1/admin/workspaces/acme-corp/members/nonexistent",
        headers=sys_h,
        json={"role": "admin"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_workspace_admin_alone_cannot_use_admin_route(client, auth_headers, db_session):
    """워크스페이스 admin 이어도 System Admin 이 아니면 /admin/workspaces 접근 불가."""
    from app.models.user_workspace_membership import UserWorkspaceMembership

    user_h = auth_headers("frank", groups=["acme-corp"])
    await client.get("/api/v1/me", headers=user_h)
    m = await db_session.get(UserWorkspaceMembership, ("frank", "acme-corp"))
    m.role = "admin"
    await db_session.flush()

    res = await client.get("/api/v1/admin/workspaces", headers=user_h)
    assert res.status_code == 403
