"""E2E 키 번들 API (ADR-0016) — 서버는 불투명 blob 보관만."""

from httpx import AsyncClient

ALICE = "user-alice"
BOB = "user-bob"
ACME = "tenant-a"

BUNDLE = {
    "salt": "c2FsdA==",
    "public_key": "UFVCTElDX0tFWQ==",
    "enc_private_key": "RU5DX1BSSVY=",
    "enc_private_key_recovery": "UkVDT1ZFUlk=",
}


async def test_keys_not_set_up_returns_404(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    r = await client.get("/api/v1/e2e/keys/me", headers=h)
    assert r.status_code == 404


async def test_put_then_get_keys_roundtrip(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    r = await client.put("/api/v1/e2e/keys/me", json=BUNDLE, headers=h)
    assert r.status_code == 200, r.text

    r = await client.get("/api/v1/e2e/keys/me", headers=h)
    assert r.status_code == 200
    assert r.json() == BUNDLE


async def test_put_is_idempotent_replace(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    await client.put("/api/v1/e2e/keys/me", json=BUNDLE, headers=h)
    updated = {**BUNDLE, "salt": "bmV3c2FsdA=="}
    r = await client.put("/api/v1/e2e/keys/me", json=updated, headers=h)
    assert r.status_code == 200
    r = await client.get("/api/v1/e2e/keys/me", headers=h)
    assert r.json()["salt"] == "bmV3c2FsdA=="


async def test_public_key_visible_to_others(
    client: AsyncClient, auth_headers, mock_storage
):
    a = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    b = auth_headers(BOB, groups=[ACME], active_company=ACME)
    await client.put("/api/v1/e2e/keys/me", json=BUNDLE, headers=a)

    # Bob 이 Alice 공개키 조회 (공유용) — 공개키만, 개인키 blob 은 안 나옴
    r = await client.get(f"/api/v1/e2e/keys/{ALICE}/public", headers=b)
    assert r.status_code == 200
    body = r.json()
    assert body["public_key"] == BUNDLE["public_key"]
    assert "enc_private_key" not in body


async def test_public_key_404_when_no_keys(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    r = await client.get(f"/api/v1/e2e/keys/{BOB}/public", headers=h)
    assert r.status_code == 404
