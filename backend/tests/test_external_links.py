"""ExternalLink: 토큰 발급, 인증 없이 공개 접근, 비밀번호, 만료."""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient

ALICE = "user-alice"
BOB = "user-bob"
ACME = "tenant-a"


async def test_create_and_access_link_without_password(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
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
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
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


async def test_revoked_404_and_expired_410(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
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
    r = await client.get(f"/s/{expired_token}")
    assert r.status_code == 410
    detail = r.json()["detail"]
    assert detail["code"] == "link_expired"
    assert detail["sharer_email"]
    assert detail["sharer_name"]
    assert detail["expired_at"]
    # 다운로드도 410
    assert (await client.post(f"/s/{expired_token}/download", json={})).status_code == 410

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
    r = await client.get(f"/s/{link['token']}")
    assert r.status_code == 404
    # 철회 링크는 공유자 연락처를 주지 않는다
    assert "sharer_email" not in r.text
    assert (await client.get("/s/no-such-token")).status_code == 404


async def test_non_owner_cannot_create_link(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    bob = auth_headers(BOB, groups=[ACME], active_workspace=ACME)
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


async def _upload(client, h, name, parent_id=None, mime=None):
    up = await client.post(
        "/api/v1/nodes/upload-url",
        json={"name": name, "size": 3, "mime": mime, "parent_id": parent_id},
        headers=h,
    )
    node_id = up.json()["node_id"]
    await client.post(f"/api/v1/nodes/{node_id}/complete", headers=h)
    return node_id


async def _folder(client, h, name, parent_id=None):
    r = await client.post(
        "/api/v1/nodes", json={"name": name, "parent_id": parent_id}, headers=h
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _link(client, h, node_id, **body):
    r = await client.post(
        f"/api/v1/nodes/{node_id}/external-links",
        json={"permission": "read", **body},
        headers=h,
    )
    assert r.status_code == 201, r.text
    return r.json()["token"]


async def test_meta_includes_sharer_and_expiry(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    node_id = await _upload(client, h, "a.pdf")
    future = (datetime.now(UTC) + timedelta(days=3)).isoformat()
    token = await _link(client, h, node_id, expires_at=future)
    r = await client.get(f"/s/{token}")
    assert r.status_code == 200
    body = r.json()
    assert body["sharer_email"]
    assert body["sharer_name"]
    assert body["expires_at"] is not None
    assert body["name"] == "a.pdf"


async def test_password_link_hides_item_until_unlocked(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    node_id = await _upload(client, h, "secret-plan.pdf")
    token = await _link(client, h, node_id, password="hunter22")

    r = await client.get(f"/s/{token}")
    body = r.json()
    assert body["requires_password"] is True
    assert body["name"] is None and body["node_id"] is None and body["kind"] is None
    assert body["size_bytes"] is None and body["mime"] is None
    assert "secret-plan" not in r.text
    assert body["sharer_email"]

    assert (await client.post(f"/s/{token}/meta", json={})).status_code == 401
    assert (
        await client.post(f"/s/{token}/meta", json={"password": "nope"})
    ).status_code == 401
    r = await client.post(f"/s/{token}/meta", json={"password": "hunter22"})
    assert r.status_code == 200
    assert r.json()["name"] == "secret-plan.pdf"


async def test_folder_link_list_navigate_download_zip(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    root = await _folder(client, h, "사진")
    sub = await _folder(client, h, "2026", parent_id=root)
    top_file = await _upload(client, h, "a.jpg", parent_id=root, mime="image/jpeg")
    deep_file = await _upload(client, h, "b.jpg", parent_id=sub, mime="image/jpeg")
    trashed = await _upload(client, h, "gone.jpg", parent_id=root)
    await client.delete(f"/api/v1/nodes/{trashed}", headers=h)
    outside = await _upload(client, h, "outside.txt")
    token = await _link(client, h, root, password="pw1234")

    # 비밀번호
    assert (await client.post(f"/s/{token}/list", json={})).status_code == 401
    assert (await client.post(f"/s/{token}/zip", json={"password": "x"})).status_code == 401

    r = await client.post(f"/s/{token}/list", json={"password": "pw1234"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "사진"
    assert [c["name"] for c in body["path"]] == ["사진"]
    names = [i["name"] for i in body["items"]]
    assert names == ["2026", "a.jpg"]  # 폴더 먼저, 휴지통 항목 제외
    assert all(i["available"] for i in body["items"])

    # 하위 폴더 탐색
    r = await client.post(f"/s/{token}/list", json={"password": "pw1234", "folder_id": sub})
    assert [c["name"] for c in r.json()["path"]] == ["사진", "2026"]
    assert [i["id"] for i in r.json()["items"]] == [deep_file]

    # 폴더 안 파일 다운로드
    r = await client.post(
        f"/s/{token}/download", json={"password": "pw1234", "node_id": deep_file}
    )
    assert r.status_code == 200
    assert r.json()["url"].startswith("http://mock-s3/get/")
    # 범위 밖, 휴지통 항목은 404
    for nid in (outside, trashed):
        r = await client.post(f"/s/{token}/download", json={"password": "pw1234", "node_id": nid})
        assert r.status_code == 404
    r = await client.post(f"/s/{token}/list", json={"password": "pw1234", "folder_id": outside})
    assert r.status_code == 404
    # 폴더 자체를 download 하면 409
    r = await client.post(f"/s/{token}/download", json={"password": "pw1234"})
    assert r.status_code == 409

    # ZIP
    r = await client.post(f"/s/{token}/zip", json={"password": "pw1234"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"
    import io
    import zipfile

    names = sorted(zipfile.ZipFile(io.BytesIO(r.content)).namelist())
    assert "a.jpg" in names and "2026/b.jpg" in names
    assert "gone.jpg" not in names
    assert top_file


async def test_file_link_cannot_list(client: AsyncClient, auth_headers, mock_storage):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    token = await _link(client, h, await _upload(client, h, "f.txt"))
    assert (await client.post(f"/s/{token}/list", json={})).status_code == 409
    assert (await client.post(f"/s/{token}/zip", json={})).status_code == 409


async def test_folder_link_with_vault_subfolder(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    root = await _folder(client, h, "공유")
    vault = await _folder(client, h, "금고", parent_id=root)
    r = await client.post(
        "/api/v1/e2e/vaults",
        json={"node_id": vault, "wrapped_vault_key": "V1JBUFBFRA=="},
        headers=h,
    )
    assert r.status_code == 200, r.text
    await _upload(client, h, "open.txt", parent_id=root)
    token = await _link(client, h, root)

    items = (await client.post(f"/s/{token}/list", json={})).json()["items"]
    by_name = {i["name"]: i for i in items}
    assert by_name["금고"]["available"] is False
    assert by_name["open.txt"]["available"] is True
    # 보안 폴더 안으로 들어가기, ZIP 은 거절
    r = await client.post(f"/s/{token}/list", json={"folder_id": vault})
    assert r.status_code == 403
    assert (await client.post(f"/s/{token}/zip", json={})).status_code == 403


async def test_patch_link_keeps_token(client: AsyncClient, auth_headers, mock_storage):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    nid = await _upload(client, h, "p.txt")
    created = (
        await client.post(f"/api/v1/nodes/{nid}/external-links", json={}, headers=h)
    ).json()
    url = f"/api/v1/nodes/{nid}/external-links/{created['id']}"

    # 만료 설정
    later = (datetime.now(UTC) + timedelta(days=7)).replace(microsecond=0)
    r = await client.patch(url, json={"expires_at": later.isoformat()}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["token"] == created["token"]
    assert datetime.fromisoformat(body["expires_at"]) == later
    assert body["has_password"] is False

    # 비밀번호 설정: 만료는 그대로 (필드 없음 = 유지)
    r = await client.patch(url, json={"password": "s3cret!"}, headers=h)
    assert r.json()["has_password"] is True
    assert datetime.fromisoformat(r.json()["expires_at"]) == later
    token = created["token"]
    assert (await client.post(f"/s/{token}/download", json={})).status_code == 401
    r = await client.post(f"/s/{token}/download", json={"password": "s3cret!"})
    assert r.status_code == 200

    # 만료 제거 + 비밀번호 해제
    r = await client.patch(url, json={"expires_at": None, "password": None}, headers=h)
    assert r.json()["expires_at"] is None
    assert r.json()["has_password"] is False
    assert r.json()["token"] == token
    assert (await client.post(f"/s/{token}/download", json={})).status_code == 200

    # 짧은 비밀번호는 거절
    assert (await client.patch(url, json={"password": "ab"}, headers=h)).status_code == 422


async def test_patch_link_permissions(client: AsyncClient, auth_headers, mock_storage):
    a = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    b = auth_headers(BOB, groups=[ACME], active_workspace=ACME)
    nid = await _upload(client, a, "q.txt")
    link = (await client.post(f"/api/v1/nodes/{nid}/external-links", json={}, headers=a)).json()
    url = f"/api/v1/nodes/{nid}/external-links/{link['id']}"
    # 남의 파일: 마스킹 404
    assert (await client.patch(url, json={"expires_at": None}, headers=b)).status_code == 404
    # 철회된 링크는 수정 불가
    await client.delete(url, headers=a)
    assert (await client.patch(url, json={"expires_at": None}, headers=a)).status_code == 404


async def test_vault_content_cannot_get_link(client: AsyncClient, auth_headers, mock_storage):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    vault = await _folder(client, h, "금고")
    r = await client.post(
        "/api/v1/e2e/vaults",
        json={"node_id": vault, "wrapped_vault_key": "V1JBUFBFRA=="},
        headers=h,
    )
    assert r.status_code == 200, r.text
    inner = await _upload(client, h, "enc.bin", parent_id=vault)
    for nid in (vault, inner):
        r = await client.post(
            f"/api/v1/nodes/{nid}/external-links", json={"permission": "read"}, headers=h
        )
        assert r.status_code == 400, r.text
