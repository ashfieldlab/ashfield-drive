"""User: 로컬 사용자 행. 인증 요청마다 액세스 토큰(sub·email·name·picture)으로 upsert.

id = 계정 서버 사용자 ID (JWT sub). 표시·외래키·join 용 + System Admin 플래그. ADR-0004, ADR-0024.
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
    # System Admin: 로컬 DB 가 원천 (SYSTEM_ADMIN_EMAILS 와 OR). 직접 UPDATE 로 임명.
    is_system_admin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    # 마지막으로 반영한 토큰 `workspaces` 클레임의 해시 (ADR-0024). 같으면 소속 동기화를 건너뛴다.
    workspaces_claim_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
