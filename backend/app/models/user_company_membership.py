"""UserCompanyMembership — 회사 멤버십 + 회사 내 역할 (ADR-0010).

두 축의 진실:
  - 회사 가입 자체 (row 존재): JWT.groups 의 lazy 캐시 — 검색/자동완성용.
    JWT 에서 빠진 회사는 cleanup 안 함 (Phase 4 단순화 — 잠시 노출 가능).
  - role 컬럼: 우리 DB 가 진실. JWT 변경과 무관. 기본 'member'.
    'admin' 은 System Admin 의 명시 임명으로만 부여.

권한 결정:
  require_company_admin → is_system_admin OR role == 'admin'.
"""

from typing import Literal

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

CompanyRole = Literal["admin", "member"]


class UserCompanyMembership(Base):
    __tablename__ = "user_company_memberships"

    user_sub: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), primary_key=True
    )
    company_id: Mapped[str] = mapped_column(
        String(128), ForeignKey("companies.id"), primary_key=True
    )
    # 회사 내 역할 — System Admin 의 명시 임명으로만 'admin'.
    # lazy upsert 가 새 row 만들 땐 server_default='member' 적용.
    role: Mapped[CompanyRole] = mapped_column(
        String(16), nullable=False, server_default="member"
    )
