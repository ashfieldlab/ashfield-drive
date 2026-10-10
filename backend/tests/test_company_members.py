"""/api/v1/companies/{id}/members — Company Admin 의 멤버 관리 (D-2)."""

import pytest


@pytest.mark.asyncio
async def test_company_admin_lists_and_promotes(client, auth_headers, db_session):
    from app.models.user_company_membership import UserCompanyMembership

    admin_h = auth_headers("frank", groups=["acme-corp"], active_company="acme-corp")
    await client.get("/api/v1/me", headers=admin_h)
    m = await db_session.get(UserCompanyMembership, ("frank", "acme-corp"))
    m.role = "admin"
    await db_session.flush()

    user_h = auth_headers("user1", groups=["acme-corp"], active_company="acme-corp")
    await client.get("/api/v1/me", headers=user_h)

    res = await client.get("/api/v1/companies/acme-corp/members", headers=admin_h)
    assert res.status_code == 200
    members = {x["user_sub"]: x for x in res.json()["members"]}
    assert "user1" in members and members["user1"]["role"] == "member"

    res = await client.patch(
        "/api/v1/companies/acme-corp/members/user1",
        headers=admin_h,
        json={"role": "admin"},
    )
    assert res.status_code == 200
    assert res.json()["role"] == "admin"


@pytest.mark.asyncio
async def test_member_cannot_manage_members(client, auth_headers):
    h = auth_headers("user1", groups=["acme-corp"], active_company="acme-corp")
    await client.get("/api/v1/me", headers=h)
    res = await client.get("/api/v1/companies/acme-corp/members", headers=h)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_company_admin_cannot_touch_other_company(client, auth_headers, db_session):
    from app.models.user_company_membership import UserCompanyMembership

    admin_h = auth_headers(
        "frank", groups=["acme-corp", "beta-co"], active_company="acme-corp"
    )
    await client.get("/api/v1/me", headers=admin_h)
    m = await db_session.get(UserCompanyMembership, ("frank", "acme-corp"))
    m.role = "admin"
    await db_session.flush()

    res = await client.get("/api/v1/companies/beta-co/members", headers=admin_h)
    assert res.status_code == 403
