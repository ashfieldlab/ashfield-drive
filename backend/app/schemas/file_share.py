from datetime import datetime
from typing import Literal

from pydantic import BaseModel, model_validator

Permission = Literal["read", "write", "manage"]


class FileShareResponse(BaseModel):
    id: str
    node_id: str
    # 개인 공유면 grantee_sub, 그룹 공유면 grantee_group_id (= 디렉터리 부서) 중 하나.
    grantee_sub: str | None = None
    grantee_email: str | None = None
    grantee_name: str | None = None
    grantee_group_id: str | None = None
    group_name: str | None = None  # 표시용 부서명 (해석되면). 미해석 시 None.
    permission: Permission
    granted_by_sub: str
    granted_at: datetime
    expires_at: datetime | None


class FileShareCreate(BaseModel):
    # grantee_sub(개인) 또는 grantee_group_id(그룹=디렉터리 부서) 중 정확히 하나.
    grantee_sub: str | None = None
    grantee_group_id: str | None = None
    permission: Permission = "read"
    expires_at: datetime | None = None

    @model_validator(mode="after")
    def _exactly_one_grantee(self) -> FileShareCreate:
        if bool(self.grantee_sub) == bool(self.grantee_group_id):
            raise ValueError(
                "grantee_sub 또는 grantee_group_id 중 정확히 하나를 지정해야 합니다."
            )
        return self


class FileShareList(BaseModel):
    shares: list[FileShareResponse]
