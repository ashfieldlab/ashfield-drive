"""ExternalLink: 토큰 발급, 인증 없이 공개 접근, 비밀번호, 만료."""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient

ALICE = "user-alice"
BOB = "user-bob"
ACME = "tenant-a"


async def test_create_and_access_link_without_password(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    up = await client.post(
        "/api/v1/nodes/upload-url",
        json={"name": "a.pdf", "size": 1, "mime": None},
        headers=h,
    )
    node_id = up.json()["node_id"]
    await client.post(f"/api/v1/nodes/{node_id}/complete", headers=h)

    r = await client.post(
        f"/api/v1/nodes/{node_id}/external-links",
        json={"permission": "read"},
        headers=h,
    )
    assert r.status_code == 201
    token = r.json()["token"]
    assert r.json()["has_password"] is False

    # 공개 메타 (인증 없이)
    r = await client.get(f"/s/{token}")
    assert r.status_code == 200
    assert r.json()["requires_password"] is False
    assert r.json()["name"] == "a.pdf"

    # 다운로드
    r = await client.post(f"/s/{token}/download", json={})
    assert r.status_code == 200
    assert r.json()["url"].startswith("http://mock-s3/get/")


async def test_password_required_and_verified(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    up = await client.post(
        "/api/v1/nodes/upload-url",
        json={"name": "secret.bin", "size": 1, "mime": None},
        headers=h,
    )
    node_id = up.json()["node_id"]
    await client.post(f"/api/v1/nodes/{node_id}/complete", headers=h)
    r = await client.post(
        f"/api/v1/nodes/{node_id}/external-links",
        json={"permission": "read", "password": "hunter22"},
        headers=h,
    )
    token = r.json()["token"]
    assert r.json()["has_password"] is True

    # 비번 없이 → 401
    r = await client.post(f"/s/{token}/download", json={})
    assert r.status_code == 401
    # 틀린 비번 → 401
    r = await client.post(f"/s/{token}/download", json={"password": "wrong"})
    assert r.status_code == 401
    # 맞는 비번 → 200
    r = await client.post(f"/s/{token}/download", json={"password": "hunter22"})
    assert r.status_code == 200


async def test_revoked_and_expired_links_return_404(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    up = await client.post(
        "/api/v1/nodes/upload-url",
        json={"name": "x.bin", "size": 1, "mime": None},
        headers=h,
    )
    node_id = up.json()["node_id"]
    await client.post(f"/api/v1/nodes/{node_id}/complete", headers=h)

    # 이미 만료된 링크
    past = (datetime.now(UTC) - timedelta(minutes=1)).isoformat()
    r = await client.post(
        f"/api/v1/nodes/{node_id}/external-links",
        json={"permission": "read", "expires_at": past},
        headers=h,
    )
    expired_token = r.json()["token"]
    assert (await client.get(f"/s/{expired_token}")).status_code == 404

    # 새로 만들고 즉시 철회
    r = await client.post(
        f"/api/v1/nodes/{node_id}/external-links",
        json={"permission": "read"},
        headers=h,
    )
    link = r.json()
    assert (await client.get(f"/s/{link['token']}")).status_code == 200
    await client.delete(
        f"/api/v1/nodes/{node_id}/external-links/{link['id']}", headers=h
    )
    assert (await client.get(f"/s/{link['token']}")).status_code == 404


async def test_non_owner_cannot_create_link(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    bob = auth_headers(BOB, groups=[ACME], active_company=ACME)
    up = await client.post(
        "/api/v1/nodes/upload-url",
        json={"name": "x.bin", "size": 1, "mime": None},
        headers=h,
    )
    node_id = up.json()["node_id"]
    await client.post(f"/api/v1/nodes/{node_id}/complete", headers=h)

    r = await client.post(
        f"/api/v1/nodes/{node_id}/external-links",
        json={"permission": "read"},
        headers=bob,
    )
    # Bob 은 그 노드 자체에 접근권한이 없으므로 404 마스킹
    assert r.status_code == 404
