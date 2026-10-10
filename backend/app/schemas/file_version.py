from datetime import datetime

from pydantic import BaseModel


class FileVersionResponse(BaseModel):
    id: str
    size_bytes: int
    saved_by: str
    saved_by_name: str | None = None
    saved_at: datetime
    created_at: datetime


class FileVersionDownloadUrl(BaseModel):
    url: str
    expires_in: int
    # 보안 폴더 파일이면 이 버전을 푸는 wrapped DEK (ADR-0016). 일반 파일은 None.
    wrapped_dek: str | None = None
