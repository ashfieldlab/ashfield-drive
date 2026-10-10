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


async def _make_admin(client, auth_headers, db_session, sub, company):
    from app.models.user_company_membership import UserCompanyMembership

    h = auth_headers(sub, groups=[company], active_company=company)
    await client.get("/api/v1/me", headers=h)
    m = await db_session.get(UserCompanyMembership, (sub, company))
    m.role = "admin"
    await db_session.flush()
    return h


@pytest.mark.asyncio
async def test_add_member_by_email(client, auth_headers, make_jwt, db_session):
    admin_h = await _make_admin(client, auth_headers, db_session, "frank", "acme-corp")

    # 아직 로그인한 적 없는 이메일 → 404
    res = await client.post(
        "/api/v1/companies/acme-corp/members",
        headers=admin_h,
        json={"email": "newbie@example.com"},
    )
    assert res.status_code == 404

    # 첫 로그인(개인 워크스페이스만 있음) 후 추가
    newbie = make_jwt("newbie", seed=False, email="Newbie@Example.com")
    await client.get("/api/v1/me", headers={"Authorization": f"Bearer {newbie}"})
    res = await client.post(
        "/api/v1/companies/acme-corp/members",
        headers=admin_h,
        json={"email": "newbie@example.com"},
    )
    assert res.status_code == 201, res.text
    assert res.json()["user_sub"] == "newbie" and res.json()["role"] == "member"

    me = (
        await client.get("/api/v1/me", headers={"Authorization": f"Bearer {newbie}"})
    ).json()
    assert "acme-corp" in me["groups"]

    dup = await client.post(
        "/api/v1/companies/acme-corp/members",
        headers=admin_h,
        json={"email": "newbie@example.com"},
    )
    assert dup.status_code == 409


@pytest.mark.asyncio
async def test_member_cannot_add_members(client, auth_headers):
    h = auth_headers("user1", groups=["acme-corp"], active_company="acme-corp")
    res = await client.post(
        "/api/v1/companies/acme-corp/members", headers=h, json={"email": "x@example.com"}
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_remove_member(client, auth_headers, db_session):
    admin_h = await _make_admin(client, auth_headers, db_session, "frank", "acme-corp")
    await client.get("/api/v1/me", headers=auth_headers("user1", groups=["acme-corp"]))

    # 본인 제거 거부
    res = await client.delete("/api/v1/companies/acme-corp/members/frank", headers=admin_h)
    assert res.status_code == 409

    res = await client.delete("/api/v1/companies/acme-corp/members/user1", headers=admin_h)
    assert res.status_code == 204
    res = await client.delete("/api/v1/companies/acme-corp/members/user1", headers=admin_h)
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_cannot_remove_last_admin(client, auth_headers, db_session):
    await _make_admin(client, auth_headers, db_session, "frank", "acme-corp")
    sysadmin = auth_headers("root", roles=["admin"])
    res = await client.delete("/api/v1/companies/acme-corp/members/frank", headers=sysadmin)
    assert res.status_code == 409
