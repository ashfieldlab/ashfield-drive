"""ExternalLink — 인증 없이 URL 로 접근할 수 있는 공유 링크.

token: URL-safe 랜덤. password_hash: PBKDF2-SHA256("salt_hex:hash_hex") 옵션.
expired/revoked 면 비활성. access_count + last_accessed_at 로 사용 흔적 기록.
"""

from datetime import datetime
from typing import Literal

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

ExternalPermission = Literal["read", "write"]


class ExternalLink(Base):
    __tablename__ = "external_links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    node_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True
    )
    permission: Mapped[ExternalPermission] = mapped_column(
        String(16), nullable=False, default="read"
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    access_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_accessed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by_sub: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
