"""AuditLog: 변경 이벤트 기록 (read 는 기록하지 않음, Phase 1).

scope: 회사별. 본인 회사 로그만 조회 가능 (admin role 필요).
entity_type: 'node' 등 (자유롭게 확장).
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # NULL = 시스템 레벨 변경 (전역 SMTP 등). 회사 컨텍스트는 항상 채워짐.
    company_id: Mapped[str | None] = mapped_column(
        String(128), ForeignKey("companies.id"), nullable=True, index=True
    )
    actor_sub: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("users.id"), nullable=True
    )
    actor_type: Mapped[str] = mapped_column(String(32), nullable=False, default="user")
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_audit_company_created", "company_id", "created_at"),
        Index("ix_audit_entity", "entity_type", "entity_id"),
    )
