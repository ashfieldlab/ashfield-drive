"""UserNotificationPreference — 사용자별 이메일 알림 on/off.

email_enabled=마스터(off 면 전체 off). email_categories=카테고리별 이메일 on/off
(키 없으면 on=기본 opt-out). 카테고리: file_share. in-app 은 pref 무관 항상.
"""

from sqlalchemy import Boolean, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UserNotificationPreference(Base):
    __tablename__ = "user_notification_preferences"

    user_sub: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), primary_key=True
    )
    email_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    # 카테고리별 이메일 on/off. 키 없으면 on. 예: {"file_share": false}
    email_categories: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'")
    )
