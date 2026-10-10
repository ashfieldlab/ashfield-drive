"""SMTP 설정: 전역 singleton + 회사별 override.

resolve 순서 (services/smtp_config.py):
  CompanySmtpOverride[company_id] → SystemSmtpConfig (id=1) → env

비밀번호는 Fernet 암호화 (app/core/crypto.py). 마스킹 표시: 평문 조회 X.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SystemSmtpConfig(Base):
    """전역 SMTP: System Admin 이 관리. 항상 id=1 한 row 만 사용 (singleton)."""

    __tablename__ = "system_smtp_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[int] = mapped_column(Integer, nullable=False)
    smtp_user: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    smtp_password_encrypted: Mapped[str] = mapped_column(
        String(2048), nullable=False, default=""
    )
    # 'none' (평문, 25/2525) | 'starttls' (587 일반적) | 'ssl' (implicit TLS, 465)
    tls_mode: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="none"
    )
    from_addr: Mapped[str] = mapped_column(String(255), nullable=False)
    from_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
        onupdate=func.now(),
    )


class CompanySmtpOverride(Base):
    """회사별 SMTP override: Company Admin 이 관리. row 있으면 전체 set 사용.

    부분 override 불가: host 만 다르고 password 는 전역 같은 패턴 금지 (resolve 단순).
    """

    __tablename__ = "company_smtp_overrides"

    company_id: Mapped[str] = mapped_column(
        String(128), ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True
    )
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[int] = mapped_column(Integer, nullable=False)
    smtp_user: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    smtp_password_encrypted: Mapped[str] = mapped_column(
        String(2048), nullable=False, default=""
    )
    # 'none' (평문, 25/2525) | 'starttls' (587 일반적) | 'ssl' (implicit TLS, 465)
    tls_mode: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="none"
    )
    from_addr: Mapped[str] = mapped_column(String(255), nullable=False)
    from_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
        onupdate=func.now(),
    )
