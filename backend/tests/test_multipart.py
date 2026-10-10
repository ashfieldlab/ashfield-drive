"""Multipart upload: 50MB+ 파일 흐름."""

from httpx import AsyncClient

ALICE = "user-alice"
ACME = "tenant-a"
BIG = 60 * 1024 * 1024  # 60MB


async def test_large_upload_uses_multipart(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    r = await client.post(
        "/api/v1/nodes/upload-url",
        json={"name": "big.zip", "size": BIG, "mime": "application/zip"},
        headers=h,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["multipart"] is True
    assert body["upload_id"]
    assert body["part_size"] > 0
    assert body["upload_url"] is None
    node_id = body["node_id"]

    # 파트 URL 발급
    r = await client.post(f"/api/v1/nodes/{node_id}/parts/1/url", headers=h)
    assert r.status_code == 200
    assert "/part/" in r.json()["url"]
    r = await client.post(f"/api/v1/nodes/{node_id}/parts/2/url", headers=h)
    assert r.status_code == 200

    # 완료
    r = await client.post(
        f"/api/v1/nodes/{node_id}/complete-multipart",
        json={
            "parts": [
                {"PartNumber": 1, "ETag": "etag-1", "Size": 30_000_000},
                {"PartNumber": 2, "ETag": "etag-2", "Size": 30_000_000},
            ]
        },
        headers=h,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ready"

    # 더 이상 parts URL 발급 안 됨
    r = await client.post(f"/api/v1/nodes/{node_id}/parts/3/url", headers=h)
    assert r.status_code == 409


async def test_small_file_still_single_put(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    r = await client.post(
        "/api/v1/nodes/upload-url",
        json={"name": "small.bin", "size": 100, "mime": None},
        headers=h,
    )
    body = r.json()
    assert body["multipart"] is False
    assert body["upload_url"]
    assert body["upload_id"] is None


async def test_delete_aborts_in_progress_multipart(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    r = await client.post(
        "/api/v1/nodes/upload-url",
        json={"name": "abort.zip", "size": BIG, "mime": None},
        headers=h,
    )
    node_id = r.json()["node_id"]

    # complete 호출 전에 삭제 → mock_storage state 에서 mpu 키 사라져야
    storage_key = f"{ACME}/{node_id}"
    assert f"mpu:{storage_key}" in mock_storage

    r = await client.delete(f"/api/v1/nodes/{node_id}", headers=h)
    assert r.status_code == 204
    assert f"mpu:{storage_key}" not in mock_storage
