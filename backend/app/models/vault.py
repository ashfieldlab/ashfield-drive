"""E2E 보안 폴더 (Vault) + 멤버십 (ADR-0016).

Vault = E2E 암호화된 Folder. 서브트리의 파일 내용·이름이 클라이언트에서만
복호화됨. vault_key 는 폴더당 1개 (클라이언트 생성) — 멤버마다 그 사람의
RSA 공개키로 wrap 해 보관 (서버는 wrap 된 것만 봄).

공유 = 멤버 추가 = vault_key 를 상대 공개키로 wrap 한 행 추가 (파일 재암호화 X).
철회 = 행 삭제 (이미 받아간 평문/키는 회수 불가 — ADR-0016 결정 4).
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Vault(Base):
    __tablename__ = "vaults"

    # vault 가 걸린 folder node. 폴더당 vault 1개 (PK).
    node_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("nodes.id", ondelete="CASCADE"), primary_key=True
    )
    company_id: Mapped[str] = mapped_column(
        String(128), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class VaultMember(Base):
    __tablename__ = "vault_members"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    vault_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vaults.node_id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_sub: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # vault_key 를 이 멤버의 RSA 공개키로 wrap (base64). 이 사람만 자기 개인키로 품.
    wrapped_vault_key: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("vault_id", "user_sub", name="uq_vault_member"),
    )
