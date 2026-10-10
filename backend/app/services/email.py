"""SMTP 발송 어댑터 + 알림 템플릿.

DEV: settings.smtp_enabled=False 이면 발송 안 하고 로그만 남김.
PROD: aiosmtplib 없이 stdlib smtplib 로 충분: 호출 빈도 낮고 동기 OK (background task).

수신자 확정:
  - users 테이블에서 email 조회 (lazy upsert 된 캐시)
  - UserNotificationPreference.email_enabled=False 면 skip
"""

from __future__ import annotations

import asyncio
from email.message import EmailMessage
from smtplib import SMTP, SMTP_SSL

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.core.logging import logger
from app.models.user import User
from app.models.user_notification_preference import UserNotificationPreference
from app.services.smtp_config import SmtpRuntime
from app.services.smtp_config import resolve as resolve_smtp

# 시그너처: (subject, body). 전부 plain text.
_TEMPLATES: dict[str, tuple[str, str]] = {
    "node_shared": (
        "[Ashfield] '{node_name}' 파일이 공유되었습니다",
        "{actor_name}님이 '{node_name}' ({kind}) 에 {permission} 권한으로 공유했습니다.\n\n"
        "확인: {base_url}/files\n",
    ),
}


def render(event_type: str, payload: dict, actor_name: str) -> tuple[str, str] | None:
    """(subject, body): 템플릿 없거나 payload 키 누락이면 None."""
    tpl = _TEMPLATES.get(event_type)
    if tpl is None:
        return None
    ctx = {**payload, "actor_name": actor_name, "base_url": settings.files_base}
    try:
        return tpl[0].format(**ctx), tpl[1].format(**ctx)
    except KeyError:
        return None


# ---------------------------------------------------------------------------
# 수신자 확정
# ---------------------------------------------------------------------------


# 알림 유형 → 사용자 이메일 설정 카테고리. 없는 유형은 게이팅 안 함.
_TYPE_CATEGORY: dict[str, str] = {
    "node_shared": "file_share",
    "node_unshared": "file_share",
}


def category_of(event_type: str) -> str | None:
    return _TYPE_CATEGORY.get(event_type)


async def resolve_recipient(
    db: AsyncSession, *, recipient_sub: str, event_type: str | None = None
) -> str | None:
    """수신 이메일: 마스터 off거나 해당 카테고리 off면 None(발송 안 함)."""
    pref = await db.get(UserNotificationPreference, recipient_sub)
    if pref is not None:
        if not pref.email_enabled:
            return None
        cat = category_of(event_type) if event_type else None
        if cat and pref.email_categories.get(cat) is False:
            return None
    user = await db.get(User, recipient_sub)
    if user is None or not user.email:
        return None
    return user.email


async def resolve_actor_name(db: AsyncSession, *, actor_sub: str | None) -> str:
    if not actor_sub:
        return "시스템"
    u = await db.get(User, actor_sub)
    return (u.name if u and u.name else (u.email if u else actor_sub)) or actor_sub


# ---------------------------------------------------------------------------
# 발송
# ---------------------------------------------------------------------------


def _check_connection_sync(cfg: SmtpRuntime) -> None:
    """발송 없이 SMTP 연결 + (optional) AUTH 만 시도.

    EHLO → [STARTTLS + EHLO] → [AUTH LOGIN] → QUIT. 실패 시 예외 raise.
    """
    if cfg.tls_mode == "ssl":
        smtp = SMTP_SSL(cfg.host, cfg.port, timeout=10)
    else:
        smtp = SMTP(cfg.host, cfg.port, timeout=10)
    try:
        smtp.ehlo()
        if cfg.tls_mode == "starttls":
            smtp.starttls()
            smtp.ehlo()
        if cfg.user:
            smtp.login(cfg.user, cfg.password)
    finally:
        try:
            smtp.quit()
        except Exception:
            pass


def _send_sync(cfg: SmtpRuntime, to_email: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{cfg.from_name} <{cfg.from_addr}>"
    msg["To"] = to_email
    msg.set_content(body)

    # tls_mode:
    #   'ssl'      → SMTP_SSL (implicit TLS, 보통 465)
    #   'starttls' → SMTP plain → starttls() 후 인증·발송 (보통 587)
    #   'none'     → 평문 SMTP (보통 25 / 2525: 운영 비추천)
    if cfg.tls_mode == "ssl":
        with SMTP_SSL(cfg.host, cfg.port, timeout=10) as smtp:
            if cfg.user:
                smtp.login(cfg.user, cfg.password)
            smtp.send_message(msg)
    else:
        with SMTP(cfg.host, cfg.port, timeout=10) as smtp:
            if cfg.tls_mode == "starttls":
                smtp.starttls()
            if cfg.user:
                smtp.login(cfg.user, cfg.password)
            smtp.send_message(msg)


async def send_for_event(
    *,
    recipient_sub: str,
    actor_sub: str | None,
    event_type: str,
    payload: dict,
    workspace_id: str | None = None,
) -> str:
    """본인 행동이 아닌 알림에 한해 이메일 발송.

    반환값(outbox 스탬프 판정용, #2):
      - "sent"    발송 성공 → emailed_at 스탬프(terminal)
      - "skipped" 수신거부·주소없음·템플릿없음·본인행동 → 스탬프(terminal, 재시도 무의미)
      - "failed"  SMTP 미설정·전송 예외 → 스탬프 안 함(relay 가 재시도)
    """
    if recipient_sub == actor_sub:
        return "skipped"

    async with AsyncSessionLocal() as db:
        cfg = await resolve_smtp(db, workspace_id=workspace_id)
        if cfg is None:
            logger.debug(
                "email_skipped_no_config",
                extra={"category": "email", "event": event_type},
            )
            return "failed"
        to_email = await resolve_recipient(
            db, recipient_sub=recipient_sub, event_type=event_type
        )
        if to_email is None:
            return "skipped"
        actor_name = await resolve_actor_name(db, actor_sub=actor_sub)
    rendered = render(event_type, payload, actor_name)
    if rendered is None:
        return "skipped"
    try:
        await asyncio.to_thread(_send_sync, cfg, to_email, *rendered)
        logger.info(
            "email_sent",
            extra={
                "category": "email",
                "event": event_type,
                "to": to_email,
                "smtp_source": cfg.source,
            },
        )
        return "sent"
    except Exception as exc:
        logger.warning(
            "email_send_failed",
            extra={
                "category": "email",
                "event": event_type,
                "to": to_email,
                "error": str(exc),
            },
        )
        return "failed"


# ---------------------------------------------------------------------------
# preferences API helper
# ---------------------------------------------------------------------------


async def get_or_create_pref(
    db: AsyncSession, *, user_sub: str
) -> UserNotificationPreference:
    stmt = select(UserNotificationPreference).where(
        UserNotificationPreference.user_sub == user_sub
    )
    pref = (await db.execute(stmt)).scalar_one_or_none()
    if pref is None:
        pref = UserNotificationPreference(user_sub=user_sub, email_enabled=True)
        db.add(pref)
    return pref
