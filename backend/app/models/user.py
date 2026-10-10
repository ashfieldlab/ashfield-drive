"""User — 로컬 사용자 행. 첫 인증 요청에서 JWT(sub·email·name·image)로 upsert.

id = Better Auth 사용자 ID (JWT sub). 표시·외래키·join 용 + System Admin 플래그. ADR-0004.
"""

from sqlalchemy import Boolean, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # JWT sub
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 프로필 이미지 URL (소셜 로그인 제공자). 표시용.
    image: Mapped[str | None] = mapped_column(Text, nullable=True)
    # System Admin — 로컬 DB 가 원천 (SYSTEM_ADMIN_EMAILS 와 OR). 직접 UPDATE 로 임명.
    is_system_admin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
