from datetime import datetime

from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: str
    type: str
    actor_sub: str | None
    actor_name: str | None  # users 캐시 표시명 (UI 친화)
    entity_type: str
    entity_id: str
    payload: dict
    read_at: datetime | None
    created_at: datetime


class NotificationListResponse(BaseModel):
    notifications: list[NotificationResponse]
    unread_count: int
    has_more: bool = False  # offset+limit 다음 페이지 존재 여부


class NotificationPatch(BaseModel):
    read: bool


class MarkAllReadResponse(BaseModel):
    marked: int


class EmailPreferenceResponse(BaseModel):
    email_enabled: bool  # 마스터 — off 면 카테고리 무관 전체 off
    # 카테고리별 이메일 on/off. 키 없으면 on(기본). 카테고리: file_share
    email_categories: dict[str, bool] = {}


class EmailPreferencePatch(BaseModel):
    email_enabled: bool | None = None
    email_categories: dict[str, bool] | None = None
