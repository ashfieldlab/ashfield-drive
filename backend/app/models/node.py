"""Node: 파일/폴더 단일 트리 (ADR-0006).

scope=personal: owner_id 본인만 접근 (Phase 1).
scope=shared: 같은 workspace 멤버 모두 접근.
status=pending: presigned upload URL 발급됐지만 complete 호출 전.
status=ready: 업로드 확인됨.
"""

from datetime import datetime
from typing import Literal

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

NodeKind = Literal["file", "folder"]
NodeScope = Literal["personal", "shared"]
NodeStatus = Literal["pending", "ready"]


class Node(Base, TimestampMixin):
    __tablename__ = "nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # uuid7
    kind: Mapped[NodeKind] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    parent_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("nodes.id", ondelete="CASCADE"), nullable=True
    )
    workspace_id: Mapped[str] = mapped_column(
        String(128), ForeignKey("workspaces.id"), nullable=False, index=True
    )
    owner_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), nullable=False, index=True
    )
    scope: Mapped[NodeScope] = mapped_column(String(16), nullable=False)

    # file 전용 필드
    storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    mime: Mapped[str | None] = mapped_column(String(255), nullable=True)
    etag: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[NodeStatus] = mapped_column(
        String(16), nullable=False, default="ready"
    )
    # S3 multipart 진행 중인 file 노드의 UploadId. 완료/취소 시 NULL.
    multipart_upload_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    # 내용 교체 (overwrite) 진행 중일 때 새 내용이 올라가는 S3 key.
    # 교체 완료 시 storage_key 로 승격 + NULL. 기존 내용은 완료 순간까지 유지
    #: 업로드 실패가 현재 파일을 깨뜨리지 않게 (write-to-new-key + swap).
    pending_storage_key: Mapped[str | None] = mapped_column(
        String(512), nullable=True
    )
    # E2E vault 파일의 wrapped DEK (ADR-0016): DEK 를 vault_key 로 암호화한 것.
    # vault 밖 일반 파일은 NULL. 서버는 이걸 보관·전달만 (복호화 불가).
    wrapped_dek: Mapped[str | None] = mapped_column(Text, nullable=True)
    # overwrite 진행 중 새 내용의 wrapped DEK: 완료 시 wrapped_dek 로 승격.
    pending_wrapped_dek: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 현재 내용을 마지막으로 저장한 사람·시각 (ADR-0022 버전 묶기 기준).
    # updated_at 은 이름 변경에도 바뀌어서 쓸 수 없다. 버전 도입 전 노드는 NULL.
    content_updated_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    content_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    parent = relationship("Node", remote_side=[id], backref="children")

    __table_args__ = (
        # NULL은 비교 대상에서 빠지므로 deleted_at NULL인 active row만 사실상 unique
        UniqueConstraint(
            "parent_id", "name", "deleted_at", name="uq_nodes_parent_name_deleted"
        ),
        Index("ix_nodes_workspace_scope_parent", "workspace_id", "scope", "parent_id"),
        Index("ix_nodes_deleted_at", "deleted_at"),
    )
