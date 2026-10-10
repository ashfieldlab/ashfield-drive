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


class ExternalLinkPatch(BaseModel):
    """URL(토큰)은 그대로 두고 설정만 바꾼다. 보낸 필드만 반영.

    expires_at: 값 = 그 시각, null = 만료 없음. password: 문자열 = 설정, null = 해제.
    """

    expires_at: datetime | None = None
    password: str | None = Field(default=None, min_length=4, max_length=128)


class ExternalLinkList(BaseModel):
    links: list[ExternalLinkResponse]


# --- Public (token 기반) ---


class PublicNodeMeta(BaseModel):
    """공개 메타. 비밀번호 링크는 비밀번호 확인 전엔 항목 정보(node_id, name, kind, size, mime)를
    비우고 비밀번호 화면에 필요한 것(공유한 사람, 만료일)만 준다. 확인 후엔 `POST /s/{token}/meta`."""

    node_id: str | None
    name: str | None
    kind: str | None
    size_bytes: int | None
    mime: str | None
    permission: ExternalPermission
    requires_password: bool
    sharer_name: str | None = None
    sharer_email: str | None = None
    expires_at: datetime | None = None


class PublicAuthRequest(BaseModel):
    password: str | None = None


class PublicDownloadRequest(BaseModel):
    password: str | None = None
    # 폴더 링크에서 그 안의 파일 하나를 받을 때. 없으면 링크 대상 자체.
    node_id: str | None = None


class PublicDownloadResponse(BaseModel):
    url: str
    expires_in: int


class PublicFolderRequest(BaseModel):
    password: str | None = None
    # 링크 폴더 안의 하위 폴더. 없으면 링크 대상 폴더.
    folder_id: str | None = None


class PublicFolderItem(BaseModel):
    id: str
    name: str
    kind: str
    size_bytes: int | None
    mime: str | None
    updated_at: datetime
    # 보안 폴더(E2E)는 링크로 열 수 없다: 목록엔 보이되 열기/다운로드 불가
    available: bool


class PublicCrumb(BaseModel):
    id: str
    name: str


class PublicFolderListing(BaseModel):
    folder_id: str
    name: str
    path: list[PublicCrumb]  # 링크 루트부터 현재 폴더까지
    items: list[PublicFolderItem]
