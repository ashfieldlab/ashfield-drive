"""Webhook endpoint CRUD + dispatch fan-out + 서명 검증."""

import asyncio
import hashlib
import hmac
import json

import httpx
from httpx import AsyncClient

ALICE = "user-alice"
BOB = "user-bob"
ADMIN = "user-admin"
ACME = "tenant-a"


async def _ensure_user(client, auth_headers, sub):
    await client.get(
        "/api/v1/me",
        headers=auth_headers(sub, groups=[ACME], active_company=ACME),
    )


async def test_endpoint_crud_admin_only(client: AsyncClient, auth_headers):
    user = auth_headers(ALICE, groups=[ACME], active_company=ACME)
    admin = auth_headers(ADMIN, groups=[ACME], roles=["admin"], active_company=ACME)

    # 일반 사용자 → 403
    r = await client.post(
        "/api/v1/webhooks",
        json={"url": "https://hook.example/notify", "events": ["*"]},
        headers=user,
    )
    assert r.status_code == 403

    # admin 생성 — secret 1회 반환
    r = await client.post(
        "/api/v1/webhooks",
        json={"url": "https://hook.example/notify", "events": ["node_shared"]},
        headers=admin,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["secret"]  # 1회 노출
    assert body["events"] == ["node_shared"]
    ep_id = body["id"]

    # 목록 — secret 안 보임
    r = await client.get("/api/v1/webhooks", headers=admin)
    assert all(e["secret"] is None for e in r.json()["endpoints"])

    # patch active=false
    r = await client.patch(
        f"/api/v1/webhooks/{ep_id}", json={"active": False}, headers=admin
    )
    assert r.json()["active"] is False

    # delete
    r = await client.delete(f"/api/v1/webhooks/{ep_id}", headers=admin)
    assert r.status_code == 204


async def test_share_dispatches_webhook_with_signature(
    client: AsyncClient, auth_headers, monkeypatch, mock_storage
):
    """node_shared 이벤트 → 등록된 endpoint 로 POST + X-Workspace-Signature 검증."""
    await _ensure_user(client, auth_headers, BOB)
    admin = auth_headers(ADMIN, groups=[ACME], roles=["admin"], active_company=ACME)
    a = auth_headers(ALICE, groups=[ACME], active_company=ACME)

    # endpoint 등록
    r = await client.post(
        "/api/v1/webhooks",
        json={"url": "https://hook.example/notify", "events": ["node_shared"]},
        headers=admin,
    )
    secret = r.json()["secret"]
    ep_id = r.json()["id"]

    captured: list[dict] = []
    real_post = httpx.AsyncClient.post

    async def fake_post(self, url, content=None, headers=None, **kw):
        if "hook.example" in url:
            captured.append({"url": url, "body": content, "headers": dict(headers or {})})

            class _R:
                status_code = 200

            return _R()
        return await real_post(self, url, content=content, headers=headers, **kw)

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    # share 실행 → dispatch fire-and-forget
    node = (await client.post("/api/v1/nodes", json={"name": "F"}, headers=a)).json()
    await client.post(
        f"/api/v1/nodes/{node['id']}/shares",
        json={"grantee_sub": BOB, "permission": "read"},
        headers=a,
    )

    # asyncio task 완료 대기
    for _ in range(20):
        if captured:
            break
        await asyncio.sleep(0.05)

    assert captured, "webhook 호출이 일어나지 않음"
    call = captured[0]
    assert call["url"] == "https://hook.example/notify"
    body = call["body"]
    assert isinstance(body, bytes)
    parsed = json.loads(body.decode())
    assert parsed["type"] == "node_shared"
    assert parsed["payload"]["recipient_sub"] == BOB

    # 서명 검증
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    assert call["headers"]["X-Workspace-Signature"] == expected
    assert call["headers"]["X-Workspace-Event"] == "node_shared"

    # delivery 기록 — success
    r = await client.get(
        f"/api/v1/webhooks/{ep_id}/deliveries", headers=admin
    )
    deliveries = r.json()["deliveries"]
    assert len(deliveries) == 1
    assert deliveries[0]["status"] == "success"
    assert deliveries[0]["response_status"] == 200


async def test_event_filter_skips_non_matching(
    client: AsyncClient, auth_headers, monkeypatch, mock_storage
):
    await _ensure_user(client, auth_headers, BOB)
    admin = auth_headers(ADMIN, groups=[ACME], roles=["admin"], active_company=ACME)
    a = auth_headers(ALICE, groups=[ACME], active_company=ACME)

    # event_invited 만 구독 — node_shared 는 매칭 안 됨
    await client.post(
        "/api/v1/webhooks",
        json={"url": "https://hook.example/n", "events": ["event_invited"]},
        headers=admin,
    )

    captured: list = []
    real_post = httpx.AsyncClient.post

    async def fake_post(self, url, **kw):
        if "hook.example" in url:
            captured.append(url)

            class _R:
                status_code = 200

            return _R()
        return await real_post(self, url, **kw)

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    node = (await client.post("/api/v1/nodes", json={"name": "F2"}, headers=a)).json()
    await client.post(
        f"/api/v1/nodes/{node['id']}/shares",
        json={"grantee_sub": BOB, "permission": "read"},
        headers=a,
    )
    await asyncio.sleep(0.2)
    assert captured == []
