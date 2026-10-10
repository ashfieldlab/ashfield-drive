"""audit_logs: mutation 후 row 생성 + admin 필요."""

from httpx import AsyncClient

ALICE = "user-alice"
ADMIN = "user-admin"
ACME = "tenant-a"


async def test_node_create_writes_audit(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    r = await client.post("/api/v1/nodes", json={"name": "Foo"}, headers=h)
    node_id = r.json()["id"]

    a = auth_headers(ADMIN, groups=[ACME], roles=["admin"], active_company=ACME)
    r = await client.get("/api/v1/audit", headers=a)
    assert r.status_code == 200
    logs = r.json()["logs"]
    assert any(
        log["entity_type"] == "node"
        and log["action"] == "create"
        and log["entity_id"] == node_id
        for log in logs
    )


async def test_audit_requires_admin(client: AsyncClient, auth_headers):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    r = await client.get("/api/v1/audit", headers=h)
    assert r.status_code == 403


async def test_audit_filter_by_entity_type(
    client: AsyncClient, auth_headers, mock_storage
):
    user = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    admin = auth_headers(ADMIN, groups=[ACME], roles=["admin"], active_company=ACME)

    node = (
        await client.post("/api/v1/nodes", json={"name": "F"}, headers=user)
    ).json()
    await client.delete(f"/api/v1/nodes/{node['id']}", headers=user)

    r = await client.get("/api/v1/audit?entity_type=node", headers=admin)
    assert r.status_code == 200
    logs = r.json()["logs"]
    assert all(log["entity_type"] == "node" for log in logs)
    assert any(log["action"] == "create" for log in logs)
    assert any(log["action"] == "delete" for log in logs)


async def test_company_admin_can_view_company_audit(
    client: AsyncClient, auth_headers, db_session, mock_storage
):
    """system admin 아닌 회사 admin 이 자기 회사 감사 로그 조회."""
    from app.models.user_company_membership import UserCompanyMembership

    # BOB 을 회사 멤버로 upsert 후 admin 승격
    bob = auth_headers("user-bob", groups=[ACME], active_company=ACME)
    await client.get("/api/v1/me", headers=bob)
    m = await db_session.get(UserCompanyMembership, ("user-bob", ACME))
    m.role = "admin"
    await db_session.flush()

    # ALICE 가 노드 생성 → audit row
    await client.post(
        "/api/v1/nodes",
        json={"name": "F"},
        headers=auth_headers(ALICE, groups=[ACME], active_company=ACME),
    )

    r = await client.get("/api/v1/audit?scope=company", headers=bob)
    assert r.status_code == 200
    assert any(log["entity_type"] == "node" for log in r.json()["logs"])


async def test_company_admin_denied_system_scope(
    client: AsyncClient, auth_headers, db_session
):
    from app.models.user_company_membership import UserCompanyMembership

    bob = auth_headers("user-bob", groups=[ACME], active_company=ACME)
    await client.get("/api/v1/me", headers=bob)
    m = await db_session.get(UserCompanyMembership, ("user-bob", ACME))
    m.role = "admin"
    await db_session.flush()

    r = await client.get("/api/v1/audit?scope=system", headers=bob)
    assert r.status_code == 403


async def test_audit_filter_by_action(
    client: AsyncClient, auth_headers, mock_storage
):
    user = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    admin = auth_headers(ADMIN, groups=[ACME], roles=["admin"], active_company=ACME)
    n = await client.post("/api/v1/nodes", json={"name": "F"}, headers=user)
    await client.delete(f"/api/v1/nodes/{n.json()['id']}", headers=user)

    r = await client.get("/api/v1/audit?action=delete", headers=admin)
    assert r.status_code == 200
    assert all(log["action"] == "delete" for log in r.json()["logs"])


async def test_audit_csv_export(
    client: AsyncClient, auth_headers, mock_storage
):
    user = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    admin = auth_headers(ADMIN, groups=[ACME], roles=["admin"], active_company=ACME)
    await client.post("/api/v1/nodes", json={"name": "F"}, headers=user)

    r = await client.get("/api/v1/audit/export.csv", headers=admin)
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    assert "attachment" in r.headers["content-disposition"]
    body = r.text
    assert "시각" in body  # 헤더 행
    assert "node" in body
