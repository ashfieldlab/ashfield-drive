"""dispatch_relay: 즉시발송이 놓친 미처리 알림과 웹훅 수거 cron (#2).

즉시경로(PendingDispatch.fire)가 성공 시 각 durable row 를 done 표시하고, 이 relay 는
아직 미처리인 것만(2분+ 경과) 주워 발송한다 → 워커/API 재시작에도 유실 방지.

  - 웹훅: WebhookDelivery.status='pending' (한 번도 배달 못 함 = 재시작에 걸림)
  - 이메일: Notification.emailed_at IS NULL (발송/스킵 전)

2분 grace 로 즉시발송 in-flight 와 이중발송을 피한다. terminal(sent/skipped/failed 확정)은
row 가 done 표시되므로 다음 사이클에 안 잡힘: 무한 반복 없음. transient 실패(SMTP 미설정
등)만 NULL 로 남아 다음 사이클 재시도(설정되면 자연 복구).
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.db import AsyncSessionLocal
from app.core.logging import logger
from app.models.notification import Notification
from app.models.webhook import WebhookDelivery
from app.services.notifications import send_notification_email
from app.services.webhooks import deliver_one

_GRACE = timedelta(minutes=2)


async def dispatch_pending(ctx: dict) -> int:
    """미처리 웹훅과 이메일을 수거 발송. 처리 건수 반환."""
    upper = datetime.now(UTC) - _GRACE
    processed = 0

    async with AsyncSessionLocal() as db:
        webhook_ids = list(
            (
                await db.execute(
                    select(WebhookDelivery.id).where(
                        WebhookDelivery.status == "pending",
                        WebhookDelivery.created_at < upper,
                    )
                )
            )
            .scalars()
            .all()
        )
    for wid in webhook_ids:
        await deliver_one(wid)
        processed += 1

    async with AsyncSessionLocal() as db:
        notif_ids = list(
            (
                await db.execute(
                    select(Notification.id).where(
                        Notification.emailed_at.is_(None),
                        Notification.created_at < upper,
                    )
                )
            )
            .scalars()
            .all()
        )
    for nid in notif_ids:
        await send_notification_email(nid)
        processed += 1

    if processed:
        logger.info(
            "dispatch_relay_swept",
            extra={
                "category": "biz",
                "webhooks": len(webhook_ids),
                "emails": len(notif_ids),
            },
        )
    return processed
