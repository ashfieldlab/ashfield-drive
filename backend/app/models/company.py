"""Company: 테넌트 (= Ashfield 계정 서버의 워크스페이스, ADR-0024).

원천은 계정 서버다. 액세스 토큰의 `workspaces` 클레임으로 로컬 행을 만든다/갱신한다
(app/auth/provisioning.py). 새 행은 id = account_workspace_id = 워크스페이스 ID.
account_workspace_id 가 NULL 인 행은 계정 서버 도입 전의 로컬(레거시) 회사: 동기화가 건드리지 않는다.
"""

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Company(Base, TimestampMixin):
    __tablename__ = "companies"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # 계정 서버 워크스페이스 ID (토큰 `workspaces[].id`). NULL = 로컬(레거시) 회사.
    account_workspace_id: Mapped[str | None] = mapped_column(
        String(128), nullable=True, unique=True, index=True
    )
