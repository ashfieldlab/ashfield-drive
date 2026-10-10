"""/api/v1/companies/{id}/members: Company Admin 의 멤버 조회 (읽기 전용, ADR-0024).

멤버 추가·제거·역할 변경은 Ashfield 계정 서버가 한다: 앱엔 쓰기 API 가 없다.
"""

import pytest

from tests.conftest import ws


async def _make_admin(client, auth_headers, db_session, sub, company):
    from app.models.user_company_membership import UserCompanyMembership

    h = auth_headers(sub, groups=[company], active_company=company)
    await client.get("/api/v1/me", headers=h)
    m = await db_session.get(UserCompanyMembership, (sub, company))
    m.role = "admin"
    await db_session.flush()
    return h


@pytest.mark.asyncio
async def test_company_admin_lists_members(client, auth_headers, db_session):
    admin_h = await _make_admin(client, auth_headers, db_session, "frank", "acme-corp")
    await client.get("/api/v1/me", headers=auth_headers("user1", groups=["acme-corp"]))

    res = await client.get("/api/v1/companies/acme-corp/members", headers=admin_h)
    assert res.status_code == 200
    body = res.json()
    # 레거시(로컬) 회사: 계정 서버 워크스페이스 아님
    assert body["account_workspace_id"] is None
    members = {x["user_sub"]: x for x in body["members"]}
    assert members["user1"]["role"] == "member"
    assert members["frank"]["role"] == "admin"


@pytest.mark.asyncio
async def test_account_workspace_members_include_workspace_id(client, make_jwt):
    owner = make_jwt("ws-owner", seed=False, workspaces=[ws("wsTeam01", "owner", "팀")])
    member = make_jwt("ws-member", seed=False, workspaces=[ws("wsTeam01", "member", "팀")])
    await client.get("/api/v1/me", headers={"Authorization": f"Bearer {member}"})

    res = await client.get(
        "/api/v1/companies/wsTeam01/members",
        headers={"Authorization": f"Bearer {owner}", "X-Active-Company-Id": "wsTeam01"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["account_workspace_id"] == "wsTeam01"
    assert {m["user_sub"]: m["role"] for m in body["members"]} == {
        "ws-owner": "admin",
        "ws-member": "member",
    }

    # 멤버(앱 role member)는 목록 권한 없음
    res = await client.get(
        "/api/v1/companies/wsTeam01/members", headers={"Authorization": f"Bearer {member}"}
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_member_cannot_list_members(client, auth_headers):
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


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("POST", "/api/v1/companies/acme-corp/members", {"email": "x@example.com"}),
        ("DELETE", "/api/v1/companies/acme-corp/members/user1", None),
        ("PATCH", "/api/v1/companies/acme-corp/members/user1", {"role": "admin"}),
    ],
)
async def test_membership_writes_are_gone(client, auth_headers, db_session, method, path, body):
    """멤버 추가·제거·역할 변경은 계정 서버에서만: 앱엔 라우트가 없다 (405/404)."""
    admin_h = await _make_admin(client, auth_headers, db_session, "frank", "acme-corp")
    res = await client.request(method, path, headers=admin_h, json=body)
    assert res.status_code in (404, 405)
