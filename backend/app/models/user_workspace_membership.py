"""UserWorkspaceMembership: 워크스페이스 멤버십 + 워크스페이스 내 역할 (ADR-0004, ADR-0010).

로컬 DB 가 소속의 유일한 원천이다:
  - 첫 로그인 시 소속이 하나도 없으면 개인 워크스페이스를 만들고 admin 으로 넣는다.
  - 그 외 소속은 워크스페이스 admin 이 이메일로 추가/제거 (/api/v1/workspaces/{id}/members).
  - role: 'admin' | 'member'. 기본 'member'.

권한 결정:
  require_active_workspace → 이 테이블의 행 존재.
  require_workspace_admin → is_system_admin OR role == 'admin'.
"""

from typing import Literal

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

WorkspaceRole = Literal["admin", "member"]


class UserWorkspaceMembership(Base):
    __tablename__ = "user_workspace_memberships"

    user_sub: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), primary_key=True
    )
    workspace_id: Mapped[str] = mapped_column(
        String(128), ForeignKey("workspaces.id"), primary_key=True
    )
    role: Mapped[WorkspaceRole] = mapped_column(
        String(16), nullable=False, server_default="member"
    )
