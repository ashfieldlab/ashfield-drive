"""폴더 → zip: 트리 traverse + 상대 경로 보존."""

import io
import zipfile

from httpx import AsyncClient

ALICE = "user-alice"
ACME = "tenant-a"


async def test_zip_folder_with_files(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    # 폴더 + 하위 폴더 + 파일 2개
    root = (
        await client.post("/api/v1/nodes", json={"name": "Pack"}, headers=h)
    ).json()
    sub = (
        await client.post(
            "/api/v1/nodes",
            json={"name": "sub", "parent_id": root["id"]},
            headers=h,
        )
    ).json()

    async def upload(name: str, parent_id: str, body: bytes) -> None:
        r = await client.post(
            "/api/v1/nodes/upload-url",
            json={
                "name": name,
                "size": len(body),
                "mime": "text/plain",
                "parent_id": parent_id,
            },
            headers=h,
        )
        nid = r.json()["node_id"]
        # body 등록: mock_storage state 에 직접
        storage_key = f"{ACME}/{nid}"
        mock_storage[f"body:{storage_key}"] = body
        await client.post(f"/api/v1/nodes/{nid}/complete", headers=h)

    await upload("readme.txt", root["id"], b"hello root")
    await upload("inner.txt", sub["id"], b"hello sub")

    r = await client.get(f"/api/v1/nodes/{root['id']}/zip", headers=h)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/zip")
    assert "Pack.zip" in r.headers["content-disposition"]

    zf = zipfile.ZipFile(io.BytesIO(r.content))
    names = zf.namelist()
    assert "readme.txt" in names
    assert "sub/inner.txt" in names
    assert zf.read("readme.txt") == b"hello root"
    assert zf.read("sub/inner.txt") == b"hello sub"


async def test_zip_rejects_non_folder(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    r = await client.post(
        "/api/v1/nodes/upload-url",
        json={"name": "a.bin", "size": 1, "mime": None},
        headers=h,
    )
    nid = r.json()["node_id"]
    await client.post(f"/api/v1/nodes/{nid}/complete", headers=h)
    r = await client.get(f"/api/v1/nodes/{nid}/zip", headers=h)
    assert r.status_code == 400


async def test_zip_too_many_files(
    client: AsyncClient, auth_headers, mock_storage, monkeypatch
):
    from app.core.config import settings as cfg

    monkeypatch.setattr(cfg, "zip_max_files", 2)

    h = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    root = (
        await client.post("/api/v1/nodes", json={"name": "Big"}, headers=h)
    ).json()
    for i in range(3):
        r = await client.post(
            "/api/v1/nodes/upload-url",
            json={
                "name": f"f{i}.bin",
                "size": 1,
                "mime": None,
                "parent_id": root["id"],
            },
            headers=h,
        )
        await client.post(
            f"/api/v1/nodes/{r.json()['node_id']}/complete", headers=h
        )
    r = await client.get(f"/api/v1/nodes/{root['id']}/zip", headers=h)
    assert r.status_code == 413
