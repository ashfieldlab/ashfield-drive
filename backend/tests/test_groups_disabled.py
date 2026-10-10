"""그룹(부서) 공유·부서 폴더: 부서 소스(외부 디렉터리)를 없애 비활성 (ADR-0023)."""

import pytest

ACME = "acme-corp"


@pytest.mark.asyncio
async def test_groups_list_is_empty(client, auth_headers):
    h = auth_headers("alice", groups=[ACME], active_company=ACME)
    res = await client.get("/api/v1/groups", headers=h)
    assert res.status_code == 200
    assert res.json() == []


@pytest.mark.asyncio
async def test_group_share_rejected(client, auth_headers, mock_storage):
    h = auth_headers("alice", groups=[ACME], active_company=ACME)
    node = (await client.post("/api/v1/nodes", json={"name": "Doc"}, headers=h)).json()
    res = await client.post(
        f"/api/v1/nodes/{node['id']}/shares",
        json={"grantee_group_id": "dept-1", "permission": "read"},
        headers=h,
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_team_folder_create_rejected(client, auth_headers, db_session):
    from app.models.user_company_membership import UserCompanyMembership

    h = auth_headers("alice", groups=[ACME], active_company=ACME)
    await client.get("/api/v1/me", headers=h)
    m = await db_session.get(UserCompanyMembership, ("alice", ACME))
    m.role = "admin"
    await db_session.flush()

    res = await client.post(
        "/api/v1/team-folders", json={"department_id": "dept-1", "name": "팀"}, headers=h
    )
    assert res.status_code == 400
    listed = await client.get("/api/v1/team-folders", headers=h)
    assert listed.status_code == 200 and listed.json() == []
