"""Notification 도메인 — emit 헬퍼.

호출자가 trigger 시점에 emit_notification() 만 부르면 됨. row 만 add, commit 은 호출자가.
Phase 3a-2 에서 webhook dispatch · 3a-3 에서 email 발송 fan-out 추가 예정.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import AsyncSessionLocal
from app.models.notification import Notification
from app.services.email import send_for_event
from app.services.webhooks import dispatch_async, enqueue_for_event


async def send_notification_email(notification_id: str) -> None:
    """Notification 한 건의 이메일 발송 + emailed_at 스탬프 — 즉시경로·relay 공용.

    idempotent: 이미 emailed_at 있으면 skip. send 결과가 terminal(sent/skipped)이면
    스탬프, transient(failed)면 NULL 유지해 relay 가 다음 사이클에 재시도.
    """
    async with AsyncSessionLocal() as db:
        n = await db.get(Notification, notification_id)
        if n is None or n.emailed_at is not None:
            return
        outcome = await send_for_event(
            recipient_sub=n.recipient_sub,
            actor_sub=n.actor_sub,
            event_type=n.type,
            payload=n.payload,
            company_id=n.company_id,
        )
        if outcome in ("sent", "skipped"):
            n.emailed_at = datetime.now(UTC)
            await db.commit()


# emit_notification 호출자가 commit 한 뒤 dispatch 가능하도록, 같은 트랜잭션에서 적재된
# WebhookDelivery row ID + Notification ID 들을 모아서 호출자에게 돌려줌.
class PendingDispatch:
    """commit 후 fire — webhook + email 즉시 발송(각 durable row 를 done 표시)."""

    def __init__(self) -> None:
        self.delivery_ids: list[str] = []
        self.notification_ids: list[str] = []

    async def fire(self) -> None:
        import asyncio

        await dispatch_async(self.delivery_ids)
        for nid in self.notification_ids:
            asyncio.create_task(send_notification_email(nid))


async def notify(
    db: AsyncSession,
    pending: PendingDispatch,
    *,
    recipient_sub: str,
    company_id: str,
    actor_sub: str | None,
    type_: str,
    entity_type: str,
    entity_id: str,
    payload: dict | None = None,
) -> None:
    """in-app emit + webhook 적재 + email 큐 적재. commit 후 pending.fire() 호출."""
    if recipient_sub == actor_sub:
        return
    n = await emit_notification(
        db,
        recipient_sub=recipient_sub,
        company_id=company_id,
        actor_sub=actor_sub,
        type_=type_,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload,
    )
    ids = await enqueue_for_event(
        db,
        company_id=company_id,
        event_type=type_,
        payload={
            "recipient_sub": recipient_sub,
            "actor_sub": actor_sub,
            "entity_type": entity_type,
            "entity_id": entity_id,
            **(payload or {}),
        },
    )
    pending.delivery_ids.extend(ids)
    # 이메일 outbox = Notification row (emailed_at). id 만 모아 commit 후 즉시 발송.
    if n is not None:
        pending.notification_ids.append(n.id)


async def emit_notification(
    db: AsyncSession,
    *,
    recipient_sub: str,
    company_id: str,
    actor_sub: str | None,
    type_: str,
    entity_type: str,
    entity_id: str,
    payload: dict | None = None,
) -> Notification | None:
    if recipient_sub == actor_sub:
        # 본인 행동에 대한 알림은 보내지 않음
        return None
    n = Notification(
        id=str(uuid.uuid7()),
        recipient_sub=recipient_sub,
        company_id=company_id,
        actor_sub=actor_sub,
        type=type_,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload or {},
    )
    db.add(n)
    return n
