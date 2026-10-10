"""Company — 테넌트. 로컬 DB 가 원천 (ADR-0004).

첫 로그인 사용자의 개인 워크스페이스는 id = "personal-{sub}" 로 결정적으로 만든다
(app/auth/provisioning.py — 동시 요청에도 ON CONFLICT 로 한 번만 생성).
"""

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Company(Base, TimestampMixin):
    __tablename__ = "companies"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
