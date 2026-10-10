"""CompanyQuota: 회사별 스토리지 한도.

storage_bytes_limit NULL = 무제한 (운영 기본). 값 = 그 회사 의 활성 파일 합계가
이 값을 넘으면 신규 업로드 거부.

사용량 측정: SUM(node.size_bytes) WHERE company_id=? AND deleted_at IS NULL
AND kind='file' AND status='ready' (services/quotas.compute_usage).
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CompanyQuota(Base):
    __tablename__ = "company_quotas"

    company_id: Mapped[str] = mapped_column(
        String(128),
        ForeignKey("companies.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # NULL = 무제한. 값 단위는 바이트.
    storage_bytes_limit: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
