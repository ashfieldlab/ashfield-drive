"""User 캐시 테이블 — JWT claim에서 lazy upsert.

권한 결정에 쓰이지 않음. 표시·외래키·join용 참조 데이터. ADR-0004 참조.
"""

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # JWT sub
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
