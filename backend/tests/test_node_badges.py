"""NodeResponse 부가 정보: share_count, has_link, content_updated_by(_name, _at)."""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import event

ALICE = "user-alice"
BOB = "user-bob"
ACME = "tenant-a"


async def _upload(client, h, name, parent_id=None):
    r = await client.post(
        "/api/v1/nodes/upload-url",
        json={"name": name, "size": 3, "mime": "text/plain", "parent_id": parent_id},
        headers=h,
    )
    nid = r.json()["node_id"]
    await client.post(f"/api/v1/nodes/{nid}/complete", headers=h)
    return nid


async def _tree(client, h) -> dict[str, dict]:
    r = await client.get("/api/v1/nodes/tree?scope=personal", headers=h)
    assert r.status_code == 200
    return {n["id"]: n for n in r.json()["nodes"]}


async def test_tree_reports_shares_links_and_saver(
    client: AsyncClient, auth_headers, mock_storage
):
    await client.get("/api/v1/me", headers=auth_headers(BOB, groups=[ACME], active_workspace=ACME))
    a = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    shared = await _upload(client, a, "shared.txt")
    linked = await _upload(client, a, "linked.txt")
    expired = await _upload(client, a, "expired.txt")
    plain = await _upload(client, a, "plain.txt")

    r = await client.post(
        f"/api/v1/nodes/{shared}/shares", json={"grantee_sub": BOB, "permission": "read"}, headers=a
    )
    assert r.status_code == 201
    r = await client.post(f"/api/v1/nodes/{linked}/external-links", json={}, headers=a)
    assert r.status_code == 201
    past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    r = await client.post(
        f"/api/v1/nodes/{expired}/external-links", json={"expires_at": past}, headers=a
    )
    assert r.status_code == 201
    # 철회된 링크는 세지 않는다
    revoked = (await client.post(f"/api/v1/nodes/{plain}/external-links", json={}, headers=a)).json()
    await client.delete(f"/api/v1/nodes/{plain}/external-links/{revoked['id']}", headers=a)

    nodes = await _tree(client, a)
    assert nodes[shared]["share_count"] == 1
    assert nodes[shared]["has_link"] is False
    assert nodes[linked]["has_link"] is True
    assert nodes[linked]["share_count"] == 0
    assert nodes[expired]["has_link"] is False
    assert nodes[plain]["has_link"] is False

    n = nodes[plain]
    assert n["content_updated_by"] == ALICE
    assert n["content_updated_by_name"] == f"{ALICE} (test)"
    assert n["content_updated_at"] is not None

    # 단건 조회도 같은 값
    one = (await client.get(f"/api/v1/nodes/{shared}", headers=a)).json()
    assert one["share_count"] == 1


async def test_tree_query_count_does_not_grow_with_nodes(
    client: AsyncClient, auth_headers, mock_storage, db_session
):
    """목록 부가 정보는 노드 수와 무관하게 몇 개의 묶음 쿼리로 (N+1 금지)."""
    a = auth_headers(ALICE, groups=[ACME], active_workspace=ACME)
    engine = db_session.bind.sync_engine if hasattr(db_session.bind, "sync_engine") else None
    assert engine is not None
    count = 0

    def on_exec(*_args, **_kw):
        nonlocal count
        count += 1

    async def measure() -> int:
        nonlocal count
        count = 0
        event.listen(engine, "before_cursor_execute", on_exec)
        try:
            await _tree(client, a)
        finally:
            event.remove(engine, "before_cursor_execute", on_exec)
        return count

    await _upload(client, a, "one.txt")
    await _tree(client, a)  # 사용자 동기화 등 첫 요청 비용 제외
    small = await measure()
    for i in range(6):
        nid = await _upload(client, a, f"more-{i}.txt")
        await client.post(f"/api/v1/nodes/{nid}/external-links", json={}, headers=a)
    large = await measure()
    assert large == small
