"""/api/v1/companies/{id}/smtp: 회사 SMTP override + 권한 분기 + resolve 우선순위."""

import pytest


@pytest.mark.asyncio
async def test_member_cannot_manage_company_smtp(client, auth_headers):
    h = auth_headers("user1", groups=["acme-corp"], active_company="acme-corp")
    await client.get("/api/v1/me", headers=h)  # lazy upsert → role=member
    res = await client.get("/api/v1/companies/acme-corp/smtp", headers=h)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_company_admin_can_manage(client, auth_headers, db_session):
    from app.models.user_company_membership import UserCompanyMembership

    h = auth_headers("frank", groups=["acme-corp"], active_company="acme-corp")
    await client.get("/api/v1/me", headers=h)
    m = await db_session.get(UserCompanyMembership, ("frank", "acme-corp"))
    m.role = "admin"
    await db_session.flush()

    res = await client.get("/api/v1/companies/acme-corp/smtp", headers=h)
    assert res.status_code == 200
    assert res.json()["override_enabled"] is False


@pytest.mark.asyncio
async def test_company_admin_cannot_touch_other_company(client, auth_headers, db_session):
    """frank 가 acme admin 이라고 해서 beta 회사 SMTP 를 만질 수 없다."""
    from app.models.user_company_membership import UserCompanyMembership

    h = auth_headers("frank", groups=["acme-corp", "beta-co"], active_company="acme-corp")
    await client.get("/api/v1/me", headers=h)
    m = await db_session.get(UserCompanyMembership, ("frank", "acme-corp"))
    m.role = "admin"
    await db_session.flush()

    res = await client.get("/api/v1/companies/beta-co/smtp", headers=h)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_resolve_prefers_company_over_system(client, auth_headers, db_session):
    """회사 override row 있으면 전역 system 보다 우선."""
    from app.models.smtp_config import CompanySmtpOverride, SystemSmtpConfig

    sys_h = auth_headers("sys", groups=["acme-corp"], roles=["admin"], active_company="acme-corp")
    await client.get("/api/v1/me", headers=sys_h)

    db_session.add(SystemSmtpConfig(
        id=1, host="sys-host", port=25,
        from_addr="sys@x", from_name=""))
    db_session.add(CompanySmtpOverride(
        company_id="acme-corp", host="company-host", port=587,
        from_addr="co@x", from_name=""))
    await db_session.flush()

    res = await client.get("/api/v1/companies/acme-corp/smtp", headers=sys_h)
    body = res.json()
    assert body["override_enabled"] is True
    assert body["host"] == "company-host"
    assert body["effective_source"] == "company"


@pytest.mark.asyncio
async def test_delete_override_falls_back_to_system(client, auth_headers, db_session):
    from app.models.smtp_config import CompanySmtpOverride, SystemSmtpConfig

    sys_h = auth_headers("sys", groups=["acme-corp"], roles=["admin"], active_company="acme-corp")
    await client.get("/api/v1/me", headers=sys_h)
    db_session.add(SystemSmtpConfig(
        id=1, host="sys-host", port=25, from_addr="sys@x", from_name=""))
    db_session.add(CompanySmtpOverride(
        company_id="acme-corp", host="company-host", port=587,
        from_addr="co@x", from_name=""))
    await db_session.flush()

    res = await client.delete("/api/v1/companies/acme-corp/smtp", headers=sys_h)
    assert res.status_code == 204

    res = await client.get("/api/v1/companies/acme-corp/smtp", headers=sys_h)
    body = res.json()
    assert body["override_enabled"] is False
    assert body["effective_source"] == "system"
