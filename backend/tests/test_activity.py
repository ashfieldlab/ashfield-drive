"""/api/v1/me/activity: 본인 행동 + 본인 알림 entity 만 노출."""

from httpx import AsyncClient

ALICE = "user-alice"
BOB = "user-bob"
ACME = "tenant-a"


async def _ensure(client, auth_headers, sub):
    await client.get(
        "/api/v1/me",
        headers=auth_headers(sub, groups=[ACME], active_workspace=ACME),
    )


async def test_activity_shows_self_actions(
    client: AsyncClient, auth_headers, mock_storage
):
    a = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    node = (await client.post("/api/v1/nodes", json={"name": "f"}, headers=a)).json()
    await client.delete(f"/api/v1/nodes/{node['id']}", headers=a)

    r = await client.get("/api/v1/me/activity", headers=a)
    assert r.status_code == 200
    items = r.json()["items"]
    assert any(
        it["action"] == "create" and it["entity_id"] == node["id"] for it in items
    )
    assert any(
        it["action"] == "delete" and it["entity_id"] == node["id"] for it in items
    )


async def test_activity_empty_for_fresh_user(client: AsyncClient, auth_headers):
    fresh = auth_headers("user-fresh", groups=[ACME], active_workspace=ACME)
    r = await client.get("/api/v1/me/activity", headers=fresh)
    assert r.status_code == 200
    assert r.json()["items"] == []


async def test_activity_shows_received_share(
    client: AsyncClient, auth_headers, mock_storage
):
    await _ensure(client, auth_headers, BOB)
    a = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    b = auth_headers(BOB, groups=[ACME], active_workspace=ACME)
    node = (await client.post("/api/v1/nodes", json={"name": "g"}, headers=a)).json()
    await client.post(
        f"/api/v1/nodes/{node['id']}/shares",
        json={"grantee_sub": BOB, "permission": "read"},
        headers=a,
    )
    # Bob 의 activity 에는 본인이 한 일이 없지만 받은 알림 entity = node['id'] 매칭으로
    # Alice 의 share audit row 가 노출되어야 함
    r = await client.get("/api/v1/me/activity", headers=b)
    items = r.json()["items"]
    assert any(
        it["action"] == "share" and it["entity_id"] == node["id"] for it in items
    )


CAROL = "user-carol"
OTHER_WS = "tenant-b"


async def _upload(client, h, *, name, parent_id, scope="personal"):
    r = await client.post(
        "/api/v1/nodes/upload-url",
        json={"name": name, "size": 10, "mime": "image/png", "parent_id": parent_id, "scope": scope},
        headers=h,
    )
    assert r.status_code == 200, r.text
    node_id = r.json()["node_id"]
    r = await client.post(f"/api/v1/nodes/{node_id}/complete", headers=h)
    assert r.status_code == 200, r.text
    return node_id


async def test_activity_shows_others_upload_into_my_folder(
    client: AsyncClient, auth_headers, mock_storage
):
    await _ensure(client, auth_headers, BOB)
    a = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    b = auth_headers(BOB, groups=[ACME], active_workspace=ACME)
    folder = (
        await client.post(
            "/api/v1/nodes", json={"name": "디자인", "scope": "shared"}, headers=a
        )
    ).json()
    file_id = await _upload(client, b, name="logo.png", parent_id=folder["id"], scope="shared")

    items = (await client.get("/api/v1/me/activity", headers=a)).json()["items"]
    hit = [it for it in items if it["entity_id"] == file_id and it["action"] == "create"]
    assert hit, items
    assert hit[0]["actor_sub"] == BOB
    assert hit[0]["node"]["name"] == "logo.png"
    assert hit[0]["node"]["parent_id"] == folder["id"]
    assert hit[0]["node"]["parent_name"] == "디자인"
    assert hit[0]["node"]["deleted"] is False


async def test_activity_shows_changes_on_shared_node_and_descendants(
    client: AsyncClient, auth_headers, mock_storage
):
    await _ensure(client, auth_headers, BOB)
    a = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    b = auth_headers(BOB, groups=[ACME], active_workspace=ACME)
    folder = (await client.post("/api/v1/nodes", json={"name": "Pkg"}, headers=a)).json()
    await client.post(
        f"/api/v1/nodes/{folder['id']}/shares",
        json={"grantee_sub": BOB, "permission": "read"},
        headers=a,
    )
    # 공유 이후의 변경: 공유 노드 자체 이름 변경 + 자손 생성/삭제
    r = await client.patch(
        f"/api/v1/nodes/{folder['id']}", json={"name": "Pkg2"}, headers=a
    )
    assert r.status_code == 200, r.text
    sub = (
        await client.post(
            "/api/v1/nodes", json={"name": "Inner", "parent_id": folder["id"]}, headers=a
        )
    ).json()
    deep = await _upload(client, a, name="deep.png", parent_id=sub["id"])
    await client.delete(f"/api/v1/nodes/{deep}", headers=a)

    items = (await client.get("/api/v1/me/activity", headers=b)).json()["items"]
    keys = {(it["action"], it["entity_id"]) for it in items}
    assert ("update", folder["id"]) in keys
    assert ("create", sub["id"]) in keys
    assert ("create", deep) in keys
    assert ("delete", deep) in keys
    deleted = next(it for it in items if it["action"] == "delete" and it["entity_id"] == deep)
    assert deleted["node"]["deleted"] is True
    assert deleted["actor_name"] is not None


async def test_activity_excludes_unrelated_activity(
    client: AsyncClient, auth_headers, mock_storage
):
    await _ensure(client, auth_headers, BOB)
    b = auth_headers(BOB, groups=[ACME], active_workspace=ACME)
    c = auth_headers(CAROL, groups=[ACME], active_workspace=ACME)
    # 같은 워크스페이스, 공유 안 된 남의 노드
    mine = (await client.post("/api/v1/nodes", json={"name": "Carol"}, headers=c)).json()
    await client.patch(f"/api/v1/nodes/{mine['id']}", json={"name": "Carol2"}, headers=c)
    # 다른 워크스페이스에서 Bob 의 공유 폴더에 해당하는 변경도 섞이지 않아야 함
    ob = auth_headers(BOB, groups=[OTHER_WS], active_workspace=OTHER_WS)
    other = (await client.post("/api/v1/nodes", json={"name": "Elsewhere"}, headers=ob)).json()

    items = (await client.get("/api/v1/me/activity", headers=b)).json()["items"]
    ids = {it["entity_id"] for it in items}
    assert mine["id"] not in ids
    assert other["id"] not in ids
    # 열람 기록은 제외
    assert all(it["entity_type"] != "file_access" for it in items)


async def test_activity_move_includes_folder_names(
    client: AsyncClient, auth_headers, mock_storage
):
    a = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    src = (await client.post("/api/v1/nodes", json={"name": "Src"}, headers=a)).json()
    dst = (await client.post("/api/v1/nodes", json={"name": "Dst"}, headers=a)).json()
    f = await _upload(client, a, name="m.png", parent_id=src["id"])
    r = await client.patch(f"/api/v1/nodes/{f}", json={"parent_id": dst["id"]}, headers=a)
    assert r.status_code == 200, r.text
    items = (await client.get("/api/v1/me/activity", headers=a)).json()["items"]
    mv = next(it for it in items if it["action"] == "update" and it["entity_id"] == f)
    assert mv["old_parent_name"] == "Src"
    assert mv["new_parent_name"] == "Dst"


async def test_activity_upload_keeps_original_folder(
    client: AsyncClient, auth_headers, mock_storage
):
    a = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    src = (await client.post("/api/v1/nodes", json={"name": "처음"}, headers=a)).json()
    dst = (await client.post("/api/v1/nodes", json={"name": "나중"}, headers=a)).json()
    f = await _upload(client, a, name="u.png", parent_id=src["id"])
    await client.patch(f"/api/v1/nodes/{f}", json={"parent_id": dst["id"]}, headers=a)
    items = (await client.get("/api/v1/me/activity", headers=a)).json()["items"]
    up = next(it for it in items if it["action"] == "create" and it["entity_id"] == f)
    assert up["meta"]["parent_id"] == src["id"]
    assert up["created_in_name"] == "처음"
    assert up["node"]["parent_name"] == "나중"
