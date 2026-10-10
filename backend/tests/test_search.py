"""/api/v1/search: 파일 검색 + 권한 격리."""


from httpx import AsyncClient

ALICE = "user-alice"
BOB = "user-bob"
ACME = "tenant-a"


async def _ensure(client, auth_headers, sub):
    await client.get(
        "/api/v1/me",
        headers=auth_headers(sub, groups=[ACME], active_workspace=ACME),
    )


async def test_search_node(
    client: AsyncClient, auth_headers, mock_storage
):
    a = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    await client.post(
        "/api/v1/nodes", json={"name": "기획서-2026"}, headers=a
    )
    await client.post(
        "/api/v1/nodes", json={"name": "noise.txt"}, headers=a
    )

    r = await client.get("/api/v1/search?q=기획", headers=a)
    assert r.status_code == 200
    body = r.json()
    node_names = [n["name"] for n in body["nodes"]]
    assert "기획서-2026" in node_names
    assert "noise.txt" not in node_names


async def test_search_empty_term_rejected(client: AsyncClient, auth_headers):
    a = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    r = await client.get("/api/v1/search?q=", headers=a)
    assert r.status_code == 422


async def test_search_isolated_per_user(
    client: AsyncClient, auth_headers, mock_storage
):
    await _ensure(client, auth_headers, BOB)
    a = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    b = auth_headers(BOB, groups=[ACME], active_workspace=ACME)

    await client.post(
        "/api/v1/nodes", json={"name": "alice-personal"}, headers=a
    )

    r = await client.get("/api/v1/search?q=alice", headers=b)
    assert r.status_code == 200
    # Bob 은 Alice 의 personal 노드 못 봄
    assert all("alice" not in n["name"] for n in r.json()["nodes"])


async def test_search_includes_file_shared_to_me(
    client: AsyncClient, auth_headers, mock_storage
):
    """다른 사람이 나에게 직접 공유한 파일이 검색에 뜬다 (ADR-0020)."""
    await _ensure(client, auth_headers, ALICE)
    await _ensure(client, auth_headers, BOB)
    a = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    b = auth_headers(BOB, groups=[ACME], active_workspace=ACME)

    n = (
        await client.post(
            "/api/v1/nodes", json={"name": "공유파일-델타"}, headers=b
        )
    ).json()

    # 공유 전: Alice 는 못 찾음
    r = await client.get("/api/v1/search?q=공유파일-델타", headers=a)
    assert all("공유파일-델타" not in x["name"] for x in r.json()["nodes"])

    # Bob 이 Alice 에게 공유
    s = await client.post(
        f"/api/v1/nodes/{n['id']}/shares",
        json={"grantee_sub": ALICE, "permission": "read"},
        headers=b,
    )
    assert s.status_code in (200, 201)

    # 공유 후: Alice 검색에 뜸
    r = await client.get("/api/v1/search?q=공유파일-델타", headers=a)
    assert any("공유파일-델타" in x["name"] for x in r.json()["nodes"])


async def test_search_kind_filter(client: AsyncClient, auth_headers):
    a = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    await client.post("/api/v1/nodes", json={"name": "카파-폴더"}, headers=a)

    r = await client.get("/api/v1/search?q=카파&kind=folder", headers=a)
    assert any("카파-폴더" in n["name"] for n in r.json()["nodes"])

    r = await client.get("/api/v1/search?q=카파&kind=file", headers=a)
    assert all("카파-폴더" not in n["name"] for n in r.json()["nodes"])
