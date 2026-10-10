"""FileVersion: 파일의 과거 내용 한 벌 (ADR-0022).

덮어쓰기·복원 때 밀려난 내용의 S3 객체를 지우지 않고 여기에 붙들어 둔다.
saved_by/saved_at = 그 내용을 저장했던 사람·시각. created_at = 버전이 된 시각(만료 기준).
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class FileVersion(Base):
    __tablename__ = "file_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    node_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    etag: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # 보안 폴더 파일이면 이 내용을 푸는 wrapped DEK (ADR-0016). 일반 파일은 NULL.
    wrapped_dek: Mapped[str | None] = mapped_column(Text, nullable=True)
    saved_by: Mapped[str] = mapped_column(String(64), nullable=False)
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (Index("ix_file_versions_node_created", "node_id", "created_at"),)
