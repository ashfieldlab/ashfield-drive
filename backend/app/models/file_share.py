"""FileShare: node 를 특정 사용자 또는 그룹(디렉터리 부서)에게 명시적으로 공유.

scope 기반 접근(personal 본인/shared 워크스페이스)을 1차로 보고, 그 외 사용자가 접근하려면 이 테이블에 row 가 필요.
폴더에 share 가 걸리면 그 자손 전부에 상속 (재귀 ancestor 조회).

grantee 는 둘 중 하나 (ADR-0016 그룹 공유, docs/group-sharing.html):
  - grantee_sub        : 개인 (users.id)
  - grantee_group_id   : 그룹 = department_id (외부 참조, FK 아님). 현재 생성 비활성 (services/departments.py)
"""

from datetime import datetime
from typing import Literal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

Permission = Literal["read", "write", "manage"]


class FileShare(Base):
    __tablename__ = "file_shares"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    node_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # 개인 공유 대상 (그룹 공유면 NULL)
    grantee_sub: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("users.id"), nullable=True, index=True
    )
    # 그룹 공유 대상 = directory department_id (개인 공유면 NULL). 외부 참조라 FK 없음.
    grantee_group_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )
    permission: Mapped[Permission] = mapped_column(String(16), nullable=False)
    granted_by_sub: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), nullable=False
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        # grantee_sub / grantee_group_id 중 정확히 하나만 채워져야 함.
        CheckConstraint(
            "(grantee_sub IS NOT NULL) <> (grantee_group_id IS NOT NULL)",
            name="ck_file_shares_one_grantee",
        ),
        # NULL 은 unique 상 서로 달라: 컬럼별 부분 unique 로 중복 차단.
        Index(
            "uq_file_shares_node_grantee",
            "node_id",
            "grantee_sub",
            unique=True,
            postgresql_where=text("grantee_sub IS NOT NULL"),
        ),
        Index(
            "uq_file_shares_node_group",
            "node_id",
            "grantee_group_id",
            unique=True,
            postgresql_where=text("grantee_group_id IS NOT NULL"),
        ),
    )
