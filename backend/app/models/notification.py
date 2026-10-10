"""Notification: in-app 알림.

이벤트 유형 (Phase 3a):
  - node_shared / node_unshared
  - external_link_expiring (Phase 3a-2 cron)

읽음/안읽음 토글, 자동 정리(60일) 는 Phase 3a-1 범위 밖.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    recipient_sub: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), nullable=False, index=True
    )
    workspace_id: Mapped[str] = mapped_column(
        String(128), ForeignKey("workspaces.id"), nullable=False
    )
    actor_sub: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("users.id"), nullable=True
    )
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # email outbox 겸용: NULL=아직 이메일 미처리(발송/스킵 전). 즉시발송 성공/스킵 시
    # 스탬프, relay cron 이 NULL 인 것만 수거(재시작 유실 방지, #2).
    emailed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_notifications_recipient_created", "recipient_sub", "created_at"),
        Index("ix_notifications_recipient_unread", "recipient_sub", "read_at"),
        # relay 가 미발송분만 훑도록 부분 인덱스 (미발송 row 만 담겨 작음).
        Index(
            "ix_notifications_unsent",
            "created_at",
            postgresql_where=text("emailed_at IS NULL"),
        ),
    )
