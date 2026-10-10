"""Webhook dispatcher: emit_notification 직후 같은 트랜잭션에 row 추가, 백그라운드로 fire-and-forget.

신뢰성 트레이드오프:
  - 단순 in-process asyncio.create_task: 워커 재시작 시 진행 중이던 시도는 유실.
  - 실패 시 attempt+1 로 즉시 1회 재시도, 그 다음은 별도 cron 으로 backoff (Phase 3a-2 범위 밖).
  - Production scale 에선 Celery/RQ/Cloud Tasks 로 교체. Phase 1.5 같은 단계.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import secrets
import uuid
from datetime import UTC, datetime

import httpx
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import AsyncSessionLocal
from app.core.logging import logger
from app.models.webhook import WebhookDelivery, WebhookEndpoint

_TIMEOUT = 5.0
_MAX_ATTEMPTS = 2


def new_secret() -> str:
    return secrets.token_urlsafe(32)


def new_id() -> str:
    return str(uuid.uuid7())


def sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


async def enqueue_for_event(
    db: AsyncSession,
    *,
    workspace_id: str,
    event_type: str,
    payload: dict,
) -> list[str]:
    """현재 트랜잭션에 매칭 endpoint 만큼 WebhookDelivery row 를 추가.

    실제 HTTP 전송은 commit 이후 dispatch_pending() 호출자가 task 로 fire.
    """
    stmt = select(WebhookEndpoint).where(
        and_(
            WebhookEndpoint.workspace_id == workspace_id,
            WebhookEndpoint.active.is_(True),
        )
    )
    endpoints = list((await db.execute(stmt)).scalars().all())
    delivery_ids: list[str] = []
    for ep in endpoints:
        events: list[str] = ep.events or []
        if "*" not in events and event_type not in events:
            continue
        d = WebhookDelivery(
            id=new_id(),
            endpoint_id=ep.id,
            event_type=event_type,
            payload=payload,
        )
        db.add(d)
        delivery_ids.append(d.id)
    return delivery_ids


async def dispatch_async(delivery_ids: list[str]) -> None:
    """백그라운드 fire-and-forget: 자체 세션 / 트랜잭션 사용."""
    if not delivery_ids:
        return
    for d_id in delivery_ids:
        asyncio.create_task(deliver_one(d_id))


async def deliver_one(delivery_id: str) -> None:
    async with AsyncSessionLocal() as db:
        delivery = await db.get(WebhookDelivery, delivery_id)
        if delivery is None:
            return
        endpoint = await db.get(WebhookEndpoint, delivery.endpoint_id)
        if endpoint is None or not endpoint.active:
            delivery.status = "failed"
            delivery.error = "endpoint missing or disabled"
            await db.commit()
            return

        body = json.dumps(
            {
                "type": delivery.event_type,
                "delivery_id": delivery.id,
                "payload": delivery.payload,
            },
            ensure_ascii=False,
        ).encode("utf-8")
        signature = sign(endpoint.secret, body)

        last_error: str | None = None
        last_status: int | None = None
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            delivery.attempt = attempt
            try:
                async with httpx.AsyncClient(timeout=_TIMEOUT) as cli:
                    r = await cli.post(
                        endpoint.url,
                        content=body,
                        headers={
                            "Content-Type": "application/json",
                            "X-Workspace-Signature": signature,
                            "X-Workspace-Event": delivery.event_type,
                            "X-Workspace-Delivery": delivery.id,
                        },
                    )
                last_status = r.status_code
                if 200 <= r.status_code < 300:
                    delivery.status = "success"
                    delivery.response_status = r.status_code
                    delivery.delivered_at = datetime.now(UTC)
                    await db.commit()
                    return
                last_error = f"HTTP {r.status_code}"
            except httpx.HTTPError as exc:
                last_error = str(exc)
            # 즉시 재시도 짧은 텀
            await asyncio.sleep(0.5 * attempt)

        delivery.status = "failed"
        delivery.error = last_error
        delivery.response_status = last_status
        await db.commit()
        logger.warning(
            "webhook_delivery_failed",
            extra={
                "category": "webhook",
                "delivery_id": delivery.id,
                "endpoint_id": endpoint.id,
                "event": delivery.event_type,
                "error": last_error,
            },
        )
