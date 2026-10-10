from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ExternalPermission = Literal["read", "write"]


class ExternalLinkResponse(BaseModel):
    id: str
    node_id: str
    token: str
    permission: ExternalPermission
    expires_at: datetime | None
    has_password: bool
    access_count: int
    last_accessed_at: datetime | None
    created_at: datetime
    revoked_at: datetime | None


class ExternalLinkCreate(BaseModel):
    permission: ExternalPermission = "read"
    expires_at: datetime | None = None
    password: str | None = Field(default=None, min_length=4, max_length=128)


class ExternalLinkList(BaseModel):
    links: list[ExternalLinkResponse]


# --- Public (token 기반) ---


class PublicNodeMeta(BaseModel):
    node_id: str
    name: str
    kind: str
    size_bytes: int | None
    mime: str | None
    permission: ExternalPermission
    requires_password: bool


class PublicDownloadRequest(BaseModel):
    password: str | None = None


class PublicDownloadResponse(BaseModel):
    url: str
    expires_in: int
