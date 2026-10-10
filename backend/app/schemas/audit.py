from datetime import datetime

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: str
    company_id: str | None  # NULL = 시스템 레벨 변경
    actor_sub: str | None
    actor_name: str | None  # users 캐시 표시명 (UI 친화)
    actor_type: str
    action: str
    entity_type: str
    entity_id: str
    meta: dict
    request_id: str | None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    logs: list[AuditLogResponse]
