"""UserQuota — 회사 안에서 개별 멤버의 스토리지 한도.

한도 = (company_id, user_sub) 단위. NULL = 무제한(미설정). 회사 관리자가 설정.
사용량 = 그 사용자가 그 회사에 올린 활성 파일 size_bytes 합
(owner_id=user_sub AND company_id=company). 회사 전체 한도(CompanyQuota)와
독립적으로 함께 검증된다 — 둘 중 하나라도 넘으면 업로드 거부.
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UserQuota(Base):
    __tablename__ = "user_quotas"

    company_id: Mapped[str] = mapped_column(
        String(128),
        ForeignKey("companies.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_sub: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # NULL = 무제한. 값 단위는 바이트. 0 = 새 업로드 전부 차단.
    storage_bytes_limit: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
