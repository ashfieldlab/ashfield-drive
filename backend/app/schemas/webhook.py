from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl


class WebhookEndpointResponse(BaseModel):
    id: str
    url: str
    events: list[str]
    active: bool
    created_at: datetime
    # secret 은 생성 직후 1회만 노출
    secret: str | None = None


class WebhookEndpointCreate(BaseModel):
    url: HttpUrl
    events: list[str] = Field(default_factory=lambda: ["*"])


class WebhookEndpointPatch(BaseModel):
    url: HttpUrl | None = None
    events: list[str] | None = None
    active: bool | None = None


class WebhookEndpointList(BaseModel):
    endpoints: list[WebhookEndpointResponse]


class WebhookDeliveryResponse(BaseModel):
    id: str
    endpoint_id: str
    event_type: str
    attempt: int
    status: str
    response_status: int | None
    error: str | None
    created_at: datetime
    delivered_at: datetime | None


class WebhookDeliveryList(BaseModel):
    deliveries: list[WebhookDeliveryResponse]
