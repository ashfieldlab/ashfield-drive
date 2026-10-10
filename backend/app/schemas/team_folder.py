from datetime import datetime

from pydantic import BaseModel, Field


class TeamFolderCreate(BaseModel):
    department_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=255)


class TeamFolderResponse(BaseModel):
    node_id: str
    name: str
    department_id: str
    department_name: str | None = None  # 표시용 (외부 디렉터리 해석되면)
    created_by: str
    created_at: datetime
