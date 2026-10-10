"""Team folder: 부서(directory department)에 묶인 공용 폴더 (docs/group-sharing.html 4단계).

vaults 와 평행한 구조: shared scope 폴더에 binding 을 걸어, effective_permission 이
"회사 전원 write" 대신 "그 부서(+하위)만" ACL 로 오버라이드한다. 주인 없는 회사 공용 자산.
멤버십은 부서를 동적으로 따라감 (접근집합 매칭). 부서 소스가 없어 현재 비활성: services/departments.py.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class TeamFolder(Base):
    __tablename__ = "team_folders"

    # 팀 폴더 루트 node (shared scope). 폴더당 1개 (PK).
    node_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("nodes.id", ondelete="CASCADE"), primary_key=True
    )
    company_id: Mapped[str] = mapped_column(
        String(128),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # 이 폴더가 묶인 디렉터리 부서 id (외부 참조, FK 아님). 그 부서+하위가 접근.
    department_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
