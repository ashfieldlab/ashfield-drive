"""nodes API 핵심 경로: 폴더 트리, 업로드 흐름, 다른 워크스페이스 격리, 휴지통."""

from httpx import AsyncClient

ALICE = "user-alice"
BOB = "user-bob"
ACME = "tenant-a"
BETA = "tenant-b"


async def test_folder_create_lists_in_tree(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    r = await client.post("/api/v1/nodes", json={"name": "Docs"}, headers=h)
    assert r.status_code == 201, r.text
    folder_id = r.json()["id"]

    r = await client.get("/api/v1/nodes/tree?scope=personal", headers=h)
    assert r.status_code == 200
    names = [n["name"] for n in r.json()["nodes"]]
    assert "Docs" in names

    # 자식 조회: 빈 폴더
    r = await client.get(
        f"/api/v1/nodes/tree?scope=personal&parent_id={folder_id}", headers=h
    )
    assert r.status_code == 200
    assert r.json()["nodes"] == []


async def test_duplicate_name_auto_renames(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    await client.post("/api/v1/nodes", json={"name": "Docs"}, headers=h)
    r = await client.post("/api/v1/nodes", json={"name": "Docs"}, headers=h)
    assert r.status_code == 201
    assert r.json()["name"] == "Docs (2)"


async def test_upload_flow_pending_to_ready(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    r = await client.post(
        "/api/v1/nodes/upload-url",
        json={"name": "spec.pdf", "size": 123, "mime": "application/pdf"},
        headers=h,
    )
    assert r.status_code == 200, r.text
    node_id = r.json()["node_id"]
    assert r.json()["upload_url"].startswith("http://mock-s3/put/")

    # 업로드 전엔 status=pending: 단건 조회로 확인
    r = await client.get(f"/api/v1/nodes/{node_id}", headers=h)
    assert r.json()["status"] == "pending"

    r = await client.post(f"/api/v1/nodes/{node_id}/complete", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "ready"
    assert body["size_bytes"] == 123


async def test_download_url_only_when_ready(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    r = await client.post(
        "/api/v1/nodes/upload-url",
        json={"name": "a.bin", "size": 1, "mime": None},
        headers=h,
    )
    node_id = r.json()["node_id"]

    # pending 단계: 409
    r = await client.post(f"/api/v1/nodes/{node_id}/download-url", headers=h)
    assert r.status_code == 409

    await client.post(f"/api/v1/nodes/{node_id}/complete", headers=h)
    r = await client.post(f"/api/v1/nodes/{node_id}/download-url", headers=h)
    assert r.status_code == 200
    assert r.json()["url"].startswith("http://mock-s3/get/")


async def test_other_workspace_isolation(
    client: AsyncClient, auth_headers, mock_storage
):
    a = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    b = auth_headers(BOB, groups=[BETA], active_workspace=BETA)

    r = await client.post(
        "/api/v1/nodes", json={"name": "AcmeOnly"}, headers=a
    )
    node_id = r.json()["id"]

    # Bob 은 BETA 활성: 다른 워크스페이스 노드는 404 마스킹
    r = await client.get(f"/api/v1/nodes/{node_id}", headers=b)
    assert r.status_code == 404
    r = await client.delete(f"/api/v1/nodes/{node_id}", headers=b)
    assert r.status_code == 404


async def test_trash_and_restore(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    r = await client.post("/api/v1/nodes", json={"name": "Temp"}, headers=h)
    node_id = r.json()["id"]

    r = await client.delete(f"/api/v1/nodes/{node_id}", headers=h)
    assert r.status_code == 204

    # tree 에선 사라짐, trash 에선 보임
    tree = (await client.get("/api/v1/nodes/tree?scope=personal", headers=h)).json()
    assert node_id not in [n["id"] for n in tree["nodes"]]
    trash = (await client.get("/api/v1/nodes/trash", headers=h)).json()
    assert node_id in [n["id"] for n in trash["nodes"]]

    r = await client.post(f"/api/v1/nodes/{node_id}/restore", headers=h)
    assert r.status_code == 200
    assert r.json()["deleted_at"] is None


async def test_folder_cannot_move_into_self(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    f = (await client.post("/api/v1/nodes", json={"name": "F"}, headers=h)).json()
    r = await client.patch(
        f"/api/v1/nodes/{f['id']}", json={"parent_id": f["id"]}, headers=h
    )
    assert r.status_code == 400


async def test_folder_cannot_move_into_descendant(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    a = (await client.post("/api/v1/nodes", json={"name": "A"}, headers=h)).json()
    b = (
        await client.post(
            "/api/v1/nodes",
            json={"name": "B", "parent_id": a["id"]},
            headers=h,
        )
    ).json()
    c = (
        await client.post(
            "/api/v1/nodes",
            json={"name": "C", "parent_id": b["id"]},
            headers=h,
        )
    ).json()
    # A 를 C(자손) 아래로 이동 시도 → 400
    r = await client.patch(
        f"/api/v1/nodes/{a['id']}", json={"parent_id": c["id"]}, headers=h
    )
    assert r.status_code == 400


async def test_active_workspace_must_be_in_groups(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=BETA)
    r = await client.get("/api/v1/nodes/tree?scope=personal", headers=h)
    assert r.status_code == 403


async def _make_ready_file(client, h, name="doc.bin", size=10):
    r = await client.post(
        "/api/v1/nodes/upload-url",
        json={"name": name, "size": size, "mime": None},
        headers=h,
    )
    node_id = r.json()["node_id"]
    await client.post(f"/api/v1/nodes/{node_id}/complete", headers=h)
    return node_id


async def test_overwrite_replaces_content(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    node_id = await _make_ready_file(client, h)

    # 교체 시작: 새 내용 presigned URL
    r = await client.post(
        f"/api/v1/nodes/{node_id}/overwrite-url",
        json={"size": 999, "mime": "text/plain"},
        headers=h,
    )
    assert r.status_code == 200, r.text
    assert r.json()["upload_url"].startswith("http://mock-s3/put/")

    # 교체 완료: ready 유지, 같은 node_id
    r = await client.post(
        f"/api/v1/nodes/{node_id}/overwrite-complete", json={}, headers=h
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == node_id
    assert body["status"] == "ready"


async def test_overwrite_if_match_conflict(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    node_id = await _make_ready_file(client, h)

    # 잘못된 etag → 412 (동시 수정 충돌)
    r = await client.post(
        f"/api/v1/nodes/{node_id}/overwrite-url",
        json={"size": 5},
        headers={**h, "If-Match": "stale-etag"},
    )
    assert r.status_code == 412
    assert r.json()["detail"]["code"] == "ETAG_MISMATCH"


async def test_overwrite_rejects_folder(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    r = await client.post("/api/v1/nodes", json={"name": "Dir"}, headers=h)
    folder_id = r.json()["id"]

    r = await client.post(
        f"/api/v1/nodes/{folder_id}/overwrite-url", json={"size": 1}, headers=h
    )
    assert r.status_code == 400


async def test_overwrite_complete_without_start(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    node_id = await _make_ready_file(client, h)

    # overwrite-url 없이 바로 complete → 409
    r = await client.post(
        f"/api/v1/nodes/{node_id}/overwrite-complete", json={}, headers=h
    )
    assert r.status_code == 409


async def test_recursive_tree_returns_full_subtree(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    # 루트 폴더 + 그 안에 중첩 폴더 + 파일
    r = await client.post("/api/v1/nodes", json={"name": "outer"}, headers=h)
    outer = r.json()["id"]
    r = await client.post(
        "/api/v1/nodes", json={"name": "inner", "parent_id": outer}, headers=h
    )
    inner = r.json()["id"]
    await client.post(
        "/api/v1/nodes", json={"name": "deep", "parent_id": inner}, headers=h
    )

    # 한 단계 (기존): 루트만
    r = await client.get("/api/v1/nodes/tree?scope=personal", headers=h)
    names = {n["name"] for n in r.json()["nodes"]}
    assert "outer" in names and "inner" not in names

    # 재귀: 전부
    r = await client.get("/api/v1/nodes/tree?scope=personal&recursive=true", headers=h)
    names = {n["name"] for n in r.json()["nodes"]}
    assert {"outer", "inner", "deep"} <= names


async def test_delete_folder_cascades_to_descendants(
    client: AsyncClient, auth_headers, mock_storage
):
    h = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    r = await client.post("/api/v1/nodes", json={"name": "box"}, headers=h)
    box = r.json()["id"]
    r = await client.post(
        "/api/v1/nodes", json={"name": "sub", "parent_id": box}, headers=h
    )
    sub = r.json()["id"]
    # 파일 하나 sub 안에
    up = await client.post(
        "/api/v1/nodes/upload-url",
        json={"name": "f.bin", "parent_id": sub, "size": 1, "mime": None},
        headers=h,
    )
    fid = up.json()["node_id"]
    await client.post(f"/api/v1/nodes/{fid}/complete", headers=h)

    # box 삭제 → sub, f.bin 도 휴지통으로
    r = await client.delete(f"/api/v1/nodes/{box}", headers=h)
    assert r.status_code == 204

    # recursive tree 에 box/sub/f.bin 모두 없어야 (고아 없음)
    r = await client.get("/api/v1/nodes/tree?scope=personal&recursive=true", headers=h)
    ids = {n["id"] for n in r.json()["nodes"]}
    assert box not in ids and sub not in ids and fid not in ids

    # 셋 다 휴지통에
    r = await client.get("/api/v1/nodes/trash", headers=h)
    trash_ids = {n["id"] for n in r.json()["nodes"]}
    assert {box, sub, fid} <= trash_ids
