"""FileShare — 직접 공유, ancestor 상속, 소유자 외 share 관리 금지."""

from httpx import AsyncClient

ALICE = "user-alice"
BOB = "user-bob"
ACME = "tenant-a"


async def _bootstrap_user(client: AsyncClient, auth_headers, sub: str):
    """JWT claims 의 lazy-upsert 로 users row 만들기."""
    await client.get(
        "/api/v1/me",
        headers=auth_headers(sub, groups=[ACME], active_company=ACME),
    )


async def test_share_grants_access_and_revoke_removes_it(
    client: AsyncClient, auth_headers, mock_storage
):
    await _bootstrap_user(client, auth_headers, BOB)
    a = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    b = auth_headers(BOB, groups=[ACME], active_company=ACME)

    node = (await client.post("/api/v1/nodes", json={"name": "Doc"}, headers=a)).json()

    # Bob 은 공유 전엔 못 봄
    r = await client.get(f"/api/v1/nodes/{node['id']}", headers=b)
    assert r.status_code == 404

    # Alice 가 Bob 에게 read 공유
    r = await client.post(
        f"/api/v1/nodes/{node['id']}/shares",
        json={"grantee_sub": BOB, "permission": "read"},
        headers=a,
    )
    assert r.status_code == 201
    share_id = r.json()["id"]

    # 이제 보임
    r = await client.get(f"/api/v1/nodes/{node['id']}", headers=b)
    assert r.status_code == 200

    # write 권한 없으면 PATCH 403
    r = await client.patch(
        f"/api/v1/nodes/{node['id']}",
        json={"name": "Renamed"},
        headers=b,
    )
    assert r.status_code == 403

    # 해제하면 다시 404
    r = await client.delete(
        f"/api/v1/nodes/{node['id']}/shares/{share_id}", headers=a
    )
    assert r.status_code == 204
    r = await client.get(f"/api/v1/nodes/{node['id']}", headers=b)
    assert r.status_code == 404


async def test_write_permission_allows_rename(
    client: AsyncClient, auth_headers, mock_storage
):
    await _bootstrap_user(client, auth_headers, BOB)
    a = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    b = auth_headers(BOB, groups=[ACME], active_company=ACME)
    node = (
        await client.post("/api/v1/nodes", json={"name": "RW"}, headers=a)
    ).json()
    await client.post(
        f"/api/v1/nodes/{node['id']}/shares",
        json={"grantee_sub": BOB, "permission": "write"},
        headers=a,
    )
    r = await client.patch(
        f"/api/v1/nodes/{node['id']}", json={"name": "RW2"}, headers=b
    )
    assert r.status_code == 200


async def test_folder_share_inherits_to_descendants(
    client: AsyncClient, auth_headers, mock_storage
):
    await _bootstrap_user(client, auth_headers, BOB)
    a = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    b = auth_headers(BOB, groups=[ACME], active_company=ACME)

    parent = (
        await client.post("/api/v1/nodes", json={"name": "Folder"}, headers=a)
    ).json()
    child = (
        await client.post(
            "/api/v1/nodes",
            json={"name": "Inside", "parent_id": parent["id"]},
            headers=a,
        )
    ).json()

    # Bob 은 child 직접 접근 X
    assert (
        await client.get(f"/api/v1/nodes/{child['id']}", headers=b)
    ).status_code == 404

    # parent 에 read share → child 도 자동 접근
    await client.post(
        f"/api/v1/nodes/{parent['id']}/shares",
        json={"grantee_sub": BOB, "permission": "read"},
        headers=a,
    )
    r = await client.get(f"/api/v1/nodes/{child['id']}", headers=b)
    assert r.status_code == 200


async def test_only_owner_can_create_share(
    client: AsyncClient, auth_headers, mock_storage
):
    await _bootstrap_user(client, auth_headers, BOB)
    a = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    b = auth_headers(BOB, groups=[ACME], active_company=ACME)
    node = (
        await client.post("/api/v1/nodes", json={"name": "Owned"}, headers=a)
    ).json()
    # Bob 이 자기에게 share 시도 → 노드 자체가 안 보이므로 404 마스킹
    r = await client.post(
        f"/api/v1/nodes/{node['id']}/shares",
        json={"grantee_sub": BOB, "permission": "read"},
        headers=b,
    )
    assert r.status_code == 404


async def test_manage_permission_can_reshare(
    client: AsyncClient, auth_headers, mock_storage
):
    """소유자가 BOB 에게 manage 를 주면 BOB 가 다른 사용자에게 공유 가능."""
    CHARLIE = "user-charlie"  # noqa: N806
    await _bootstrap_user(client, auth_headers, BOB)
    await _bootstrap_user(client, auth_headers, CHARLIE)
    a = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    b = auth_headers(BOB, groups=[ACME], active_company=ACME)
    c = auth_headers(CHARLIE, groups=[ACME], active_company=ACME)

    node = (await client.post("/api/v1/nodes", json={"name": "MGR"}, headers=a)).json()

    # Alice → Bob with manage
    await client.post(
        f"/api/v1/nodes/{node['id']}/shares",
        json={"grantee_sub": BOB, "permission": "manage"},
        headers=a,
    )

    # Bob → Charlie 공유 가능
    r = await client.post(
        f"/api/v1/nodes/{node['id']}/shares",
        json={"grantee_sub": CHARLIE, "permission": "read"},
        headers=b,
    )
    assert r.status_code == 201, r.text

    # Charlie 도 접근 가능
    r = await client.get(f"/api/v1/nodes/{node['id']}", headers=c)
    assert r.status_code == 200


async def test_write_only_cannot_reshare(
    client: AsyncClient, auth_headers, mock_storage
):
    CHARLIE = "user-charlie"  # noqa: N806
    await _bootstrap_user(client, auth_headers, BOB)
    await _bootstrap_user(client, auth_headers, CHARLIE)
    a = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    b = auth_headers(BOB, groups=[ACME], active_company=ACME)
    node = (await client.post("/api/v1/nodes", json={"name": "RW"}, headers=a)).json()
    # Alice → Bob with write (not manage)
    await client.post(
        f"/api/v1/nodes/{node['id']}/shares",
        json={"grantee_sub": BOB, "permission": "write"},
        headers=a,
    )
    r = await client.post(
        f"/api/v1/nodes/{node['id']}/shares",
        json={"grantee_sub": CHARLIE, "permission": "read"},
        headers=b,
    )
    assert r.status_code == 403


async def test_shared_with_me_lists_direct_shares(
    client: AsyncClient, auth_headers, mock_storage
):
    await _bootstrap_user(client, auth_headers, BOB)
    a = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    b = auth_headers(BOB, groups=[ACME], active_company=ACME)
    node = (
        await client.post("/api/v1/nodes", json={"name": "Pkg"}, headers=a)
    ).json()
    await client.post(
        f"/api/v1/nodes/{node['id']}/shares",
        json={"grantee_sub": BOB, "permission": "read"},
        headers=a,
    )
    r = await client.get("/api/v1/nodes/shared-with-me", headers=b)
    assert r.status_code == 200
    ids = [n["id"] for n in r.json()["nodes"]]
    assert node["id"] in ids
