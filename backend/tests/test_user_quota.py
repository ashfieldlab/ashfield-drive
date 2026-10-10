"""사용자별(워크스페이스 멤버) 스토리지 quota: 설정·조회·enforcement."""

import pytest

CO = "acme-corp"


@pytest.mark.asyncio
async def test_user_quota_set_listed_and_self(client, auth_headers):
    admin_h = auth_headers("alice", groups=[CO], roles=["admin"], active_workspace=CO)
    await client.get("/api/v1/me", headers=admin_h)
    bob_h = auth_headers("bob", groups=[CO], active_workspace=CO)
    await client.get("/api/v1/me", headers=bob_h)

    # 관리자가 bob 한도 5MB 설정
    res = await client.put(
        f"/api/v1/workspaces/{CO}/members/bob/quota",
        headers=admin_h,
        json={"storage_bytes_limit": 5_000_000},
    )
    assert res.status_code == 200
    assert res.json()["storage_bytes_limit"] == 5_000_000

    # 멤버 목록에 used/limit 노출
    res = await client.get(f"/api/v1/workspaces/{CO}/members", headers=admin_h)
    bob = next(m for m in res.json()["members"] if m["user_sub"] == "bob")
    assert bob["storage_bytes_limit"] == 5_000_000
    assert bob["storage_bytes_used"] == 0

    # bob 자기 사용량 조회
    res = await client.get("/api/v1/me/storage", headers=bob_h)
    assert res.status_code == 200
    b = res.json()
    assert b["storage_bytes_limit"] == 5_000_000
    assert b["storage_bytes_used"] == 0
    assert b["storage_pct"] == 0


@pytest.mark.asyncio
async def test_upload_blocked_when_user_quota_exceeded(
    client, auth_headers, mock_storage
):
    admin_h = auth_headers("alice", groups=[CO], roles=["admin"], active_workspace=CO)
    await client.get("/api/v1/me", headers=admin_h)
    bob_h = auth_headers("bob", groups=[CO], active_workspace=CO)
    await client.get("/api/v1/me", headers=bob_h)

    # bob 개인 한도 0: 워크스페이스 한도는 무제한이어도 개인에서 막힘
    await client.put(
        f"/api/v1/workspaces/{CO}/members/bob/quota",
        headers=admin_h,
        json={"storage_bytes_limit": 0},
    )
    res = await client.post(
        "/api/v1/nodes/upload-url",
        headers=bob_h,
        json={
            "name": "f.txt",
            "size": 1024,
            "mime": "text/plain",
            "parent_id": None,
            "scope": "personal",
        },
    )
    assert res.status_code == 413


@pytest.mark.asyncio
async def test_member_cannot_set_quota(client, auth_headers):
    h = auth_headers("user1", groups=[CO], active_workspace=CO)
    await client.get("/api/v1/me", headers=h)
    res = await client.put(
        f"/api/v1/workspaces/{CO}/members/user1/quota",
        headers=h,
        json={"storage_bytes_limit": 100},
    )
    assert res.status_code == 403
