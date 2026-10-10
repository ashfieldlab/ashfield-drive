"""/api/v1/workspaces/{id}/smtp: 워크스페이스 SMTP override + 권한 분기 + resolve 우선순위."""

import pytest


@pytest.mark.asyncio
async def test_member_cannot_manage_workspace_smtp(client, auth_headers):
    h = auth_headers("user1", groups=["acme-corp"], active_workspace="acme-corp")
    await client.get("/api/v1/me", headers=h)  # lazy upsert → role=member
    res = await client.get("/api/v1/workspaces/acme-corp/smtp", headers=h)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_workspace_admin_can_manage(client, auth_headers, db_session):
    from app.models.user_workspace_membership import UserWorkspaceMembership

    h = auth_headers("frank", groups=["acme-corp"], active_workspace="acme-corp")
    await client.get("/api/v1/me", headers=h)
    m = await db_session.get(UserWorkspaceMembership, ("frank", "acme-corp"))
    m.role = "admin"
    await db_session.flush()

    res = await client.get("/api/v1/workspaces/acme-corp/smtp", headers=h)
    assert res.status_code == 200
    assert res.json()["override_enabled"] is False


@pytest.mark.asyncio
async def test_workspace_admin_cannot_touch_other_workspace(client, auth_headers, db_session):
    """frank 가 acme admin 이라고 해서 beta 워크스페이스 SMTP 를 만질 수 없다."""
    from app.models.user_workspace_membership import UserWorkspaceMembership

    h = auth_headers("frank", groups=["acme-corp", "beta-co"], active_workspace="acme-corp")
    await client.get("/api/v1/me", headers=h)
    m = await db_session.get(UserWorkspaceMembership, ("frank", "acme-corp"))
    m.role = "admin"
    await db_session.flush()

    res = await client.get("/api/v1/workspaces/beta-co/smtp", headers=h)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_resolve_prefers_workspace_over_system(client, auth_headers, db_session):
    """워크스페이스 override row 있으면 전역 system 보다 우선."""
    from app.models.smtp_config import SystemSmtpConfig, WorkspaceSmtpOverride

    sys_h = auth_headers("sys", groups=["acme-corp"], roles=["admin"], active_workspace="acme-corp")
    await client.get("/api/v1/me", headers=sys_h)

    db_session.add(SystemSmtpConfig(
        id=1, host="sys-host", port=25,
        from_addr="sys@x", from_name=""))
    db_session.add(WorkspaceSmtpOverride(
        workspace_id="acme-corp", host="workspace-host", port=587,
        from_addr="co@x", from_name=""))
    await db_session.flush()

    res = await client.get("/api/v1/workspaces/acme-corp/smtp", headers=sys_h)
    body = res.json()
    assert body["override_enabled"] is True
    assert body["host"] == "workspace-host"
    assert body["effective_source"] == "workspace"


@pytest.mark.asyncio
async def test_delete_override_falls_back_to_system(client, auth_headers, db_session):
    from app.models.smtp_config import SystemSmtpConfig, WorkspaceSmtpOverride

    sys_h = auth_headers("sys", groups=["acme-corp"], roles=["admin"], active_workspace="acme-corp")
    await client.get("/api/v1/me", headers=sys_h)
    db_session.add(SystemSmtpConfig(
        id=1, host="sys-host", port=25, from_addr="sys@x", from_name=""))
    db_session.add(WorkspaceSmtpOverride(
        workspace_id="acme-corp", host="workspace-host", port=587,
        from_addr="co@x", from_name=""))
    await db_session.flush()

    res = await client.delete("/api/v1/workspaces/acme-corp/smtp", headers=sys_h)
    assert res.status_code == 204

    res = await client.get("/api/v1/workspaces/acme-corp/smtp", headers=sys_h)
    body = res.json()
    assert body["override_enabled"] is False
    assert body["effective_source"] == "system"
