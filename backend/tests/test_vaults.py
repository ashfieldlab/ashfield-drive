"""Vault (보안 폴더) + 멤버십 API (ADR-0016)."""

from httpx import AsyncClient

ALICE = "user-alice"
BOB = "user-bob"
ACME = "tenant-a"


async def _make_folder(client, h, name="secret"):
    r = await client.post("/api/v1/nodes", json={"name": name}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_create_vault_and_get_key(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    folder = await _make_folder(client, h)
    r = await client.post(
        "/api/v1/e2e/vaults",
        json={"node_id": folder, "wrapped_vault_key": "V1JBUFBFRA=="},
        headers=h,
    )
    assert r.status_code == 200, r.text

    # 생성자는 자동 멤버: 자기 wrapped key 조회 가능
    r = await client.get(f"/api/v1/e2e/vaults/{folder}/key", headers=h)
    assert r.status_code == 200
    assert r.json()["wrapped_vault_key"] == "V1JBUFBFRA=="

    # 목록에 노출
    r = await client.get("/api/v1/e2e/vaults", headers=h)
    assert folder in [v["node_id"] for v in r.json()]


async def test_vault_must_be_empty_folder(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    folder = await _make_folder(client, h)
    # 자식 추가 → 더는 빈 폴더 아님
    await client.post(
        "/api/v1/nodes", json={"name": "child", "parent_id": folder}, headers=h
    )
    r = await client.post(
        "/api/v1/e2e/vaults",
        json={"node_id": folder, "wrapped_vault_key": "WA=="},
        headers=h,
    )
    assert r.status_code == 400


async def test_non_member_cannot_get_key(
    client: AsyncClient, auth_headers, mock_storage
):
    a = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    b = auth_headers(BOB, groups=[ACME], active_company=ACME)
    folder = await _make_folder(client, a)
    await client.post(
        "/api/v1/e2e/vaults",
        json={"node_id": folder, "wrapped_vault_key": "WA=="},
        headers=a,
    )
    # Bob 은 비멤버: 마스킹 404
    r = await client.get(f"/api/v1/e2e/vaults/{folder}/key", headers=b)
    assert r.status_code == 404


async def test_share_adds_member(
    client: AsyncClient, auth_headers, mock_storage
):
    a = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    b = auth_headers(BOB, groups=[ACME], active_company=ACME)
    folder = await _make_folder(client, a)
    await client.post(
        "/api/v1/e2e/vaults",
        json={"node_id": folder, "wrapped_vault_key": "QUxJQ0U="},
        headers=a,
    )
    # Alice 가 Bob 을 멤버로 추가 (Bob 공개키로 wrap 한 key)
    r = await client.post(
        f"/api/v1/e2e/vaults/{folder}/members",
        json={"user_sub": BOB, "wrapped_vault_key": "Qk9C"},
        headers=a,
    )
    assert r.status_code == 200, r.text

    # 이제 Bob 도 자기 key 조회 가능
    r = await client.get(f"/api/v1/e2e/vaults/{folder}/key", headers=b)
    assert r.status_code == 200
    assert r.json()["wrapped_vault_key"] == "Qk9C"

    # 철회 후 비멤버
    r = await client.delete(f"/api/v1/e2e/vaults/{folder}/members/{BOB}", headers=a)
    assert r.status_code == 204
    r = await client.get(f"/api/v1/e2e/vaults/{folder}/key", headers=b)
    assert r.status_code == 404


async def test_vault_file_carries_wrapped_dek(
    client: AsyncClient, auth_headers, mock_storage
):
    """vault 파일 업로드 시 wrapped_dek 가 노드에 저장되고 응답에 실린다."""
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    folder = await _make_folder(client, h)
    await client.post(
        "/api/v1/e2e/vaults",
        json={"node_id": folder, "wrapped_vault_key": "QQ=="},
        headers=h,
    )
    r = await client.post(
        "/api/v1/nodes/upload-url",
        json={
            "name": "ZW5jcnlwdGVkX25hbWU=",  # 암호화된 파일명 (ciphertext)
            "parent_id": folder,
            "size": 10,
            "mime": None,
            "wrapped_dek": "V1JBUFBFRF9ERUs=",
        },
        headers=h,
    )
    assert r.status_code == 200, r.text
    node_id = r.json()["node_id"]
    r = await client.post(f"/api/v1/nodes/{node_id}/complete", headers=h)
    assert r.status_code == 200
    assert r.json()["wrapped_dek"] == "V1JBUFBFRF9ERUs="


async def test_non_member_cannot_add_member(
    client: AsyncClient, auth_headers, mock_storage
):
    a = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    b = auth_headers(BOB, groups=[ACME], active_company=ACME)
    folder = await _make_folder(client, a)
    await client.post(
        "/api/v1/e2e/vaults",
        json={"node_id": folder, "wrapped_vault_key": "QQ=="},
        headers=a,
    )
    # Bob(비멤버) 이 멤버 추가 시도 → 404 마스킹
    r = await client.post(
        f"/api/v1/e2e/vaults/{folder}/members",
        json={"user_sub": BOB, "wrapped_vault_key": "Qg=="},
        headers=b,
    )
    assert r.status_code == 404
