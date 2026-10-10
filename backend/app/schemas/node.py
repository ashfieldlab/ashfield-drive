"""Node 스키마."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

NodeKind = Literal["file", "folder"]
NodeScope = Literal["personal", "shared"]
NodeStatus = Literal["pending", "ready"]


class NodeResponse(BaseModel):
    id: str
    kind: NodeKind
    name: str
    parent_id: str | None
    company_id: str
    owner_id: str
    scope: NodeScope
    size_bytes: int | None
    mime: str | None
    etag: str | None
    status: NodeStatus
    # E2E vault 파일의 wrapped DEK (ADR-0016) — 클라이언트가 vault_key 로 풀어
    # 내용 복호화. vault 밖 파일은 None.
    wrapped_dek: str | None = None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class FolderCreate(BaseModel):
    parent_id: str | None = None
    name: str = Field(min_length=1, max_length=255)
    scope: NodeScope = "personal"


class UploadUrlRequest(BaseModel):
    parent_id: str | None = None
    name: str = Field(min_length=1, max_length=255)
    size: int = Field(ge=0)
    mime: str | None = None
    scope: NodeScope = "personal"
    # E2E vault 파일이면 wrapped DEK (선택) — 일반 파일은 None
    wrapped_dek: str | None = None


class UploadUrlResponse(BaseModel):
    node_id: str
    # multipart=False: 단일 PUT URL
    upload_url: str | None = None
    # multipart=True: 클라이언트는 part 별로 /parts/{n}/url 호출해 별도 PUT
    multipart: bool = False
    upload_id: str | None = None
    part_size: int | None = None
    expires_in: int


class PartUrlResponse(BaseModel):
    url: str
    expires_in: int


class CompleteMultipartRequest(BaseModel):
    parts: list[dict]  # [{"PartNumber": int, "ETag": "..."}, ...]


class OverwriteUrlRequest(BaseModel):
    size: int = Field(ge=0)
    mime: str | None = None
    # E2E vault 파일이면 새 내용의 wrapped DEK (선택)
    wrapped_dek: str | None = None


class OverwriteCompleteRequest(BaseModel):
    # multipart 교체일 때만 — [{"PartNumber": int, "ETag": "..."}, ...]
    parts: list[dict] | None = None


class DownloadUrlResponse(BaseModel):
    url: str
    expires_in: int


class NodePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    parent_id: str | None = None  # None = 루트 이동, 미전송 시 변경 없음


class TreeResponse(BaseModel):
    nodes: list[NodeResponse]


# Desktop sync — delta polling 응답 (GET /api/v1/nodes/changes?since=)
class NodeChange(BaseModel):
    """audit_logs 의 변경 한 건 + 그 시점의 node snapshot.

    node 가 hard-delete 됐어도 audit_logs 의 entity_id 로 식별. 그 경우 node=None.
    """
    occurred_at: datetime
    action: str  # "create" | "update" | "delete" | "restore" | "share" | "unshare"
    node_id: str
    node: NodeResponse | None  # hard-delete 시 None


class ChangesResponse(BaseModel):
    changes: list[NodeChange]
    server_time: datetime  # 다음 polling 의 since 로 사용
    has_more: bool  # true 면 같은 since 로 다시 호출 (pagination)
