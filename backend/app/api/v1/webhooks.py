"""/api/v1/webhooks: admin 전용. 외부 시스템에 알림 fan-out.

회사 단위 endpoint 등록 → notification 발생 시 매칭 endpoint 에 POST.

수신측 검증:
  ```
  HMAC-SHA256(secret, raw_body) == X-Workspace-Signature
  ```

요청 헤더:
  - `Content-Type: application/json`
  - `X-Workspace-Event: node_shared | node_unshared`
  - `X-Workspace-Delivery: <delivery_id>`
  - `X-Workspace-Signature: <hex>`

요청 본문:
  ```json
  {
    "type": "node_shared",
    "delivery_id": "...",
    "payload": { "recipient_sub": "...", "actor_sub": "...", "entity_type": "node", "entity_id": "...", ... }
  }
  ```

재시도: 2회 짧은 텀 (즉시). 항구 재시도 큐는 향후 Celery/RQ.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import get_current_user, require_active_company
from app.core.db import get_db
from app.models.webhook import WebhookDelivery, WebhookEndpoint
from app.schemas.webhook import (
    WebhookDeliveryList,
    WebhookDeliveryResponse,
    WebhookEndpointCreate,
    WebhookEndpointList,
    WebhookEndpointPatch,
    WebhookEndpointResponse,
)
from app.services.webhooks import new_id, new_secret

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _require_admin(user: UserContext) -> None:
    if not user.is_system_admin:
        raise HTTPException(403, "Admin only")


def _to_response(
    ep: WebhookEndpoint, *, include_secret: bool = False
) -> WebhookEndpointResponse:
    return WebhookEndpointResponse(
        id=ep.id,
        url=ep.url,
        events=list(ep.events or []),
        active=ep.active,
        created_at=ep.created_at,
        secret=ep.secret if include_secret else None,
    )


@router.get(
    "",
    response_model=WebhookEndpointList,
    summary="회사 endpoint 목록",
    responses={403: {"description": "admin 아님"}},
)
async def list_endpoints(
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> WebhookEndpointList:
    _require_admin(user)
    stmt = (
        select(WebhookEndpoint)
        .where(WebhookEndpoint.company_id == company_id)
        .order_by(WebhookEndpoint.created_at.desc())
    )
    rows = list((await db.execute(stmt)).scalars().all())
    return WebhookEndpointList(endpoints=[_to_response(r) for r in rows])


@router.post(
    "",
    response_model=WebhookEndpointResponse,
    status_code=201,
    summary="endpoint 등록: secret 생성·1회 노출",
    responses={
        403: {"description": "admin 아님"},
        201: {
            "description": "응답 body 의 `secret` 은 이 호출에서만 노출됨: 클라이언트가 저장 책임"
        },
    },
)
async def create_endpoint(
    body: WebhookEndpointCreate,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> WebhookEndpointResponse:
    _require_admin(user)
    ep = WebhookEndpoint(
        id=new_id(),
        company_id=company_id,
        url=str(body.url),
        secret=new_secret(),
        events=body.events,
        active=True,
        created_by_sub=user.sub,
    )
    db.add(ep)
    await db.commit()
    await db.refresh(ep)
    # secret 은 생성 직후 1회만 노출
    return _to_response(ep, include_secret=True)


@router.patch(
    "/{endpoint_id}",
    response_model=WebhookEndpointResponse,
    summary="URL/구독 이벤트/활성 토글 수정",
    responses={403: {"description": "admin 아님"}, 404: {"description": "없음"}},
)
async def patch_endpoint(
    endpoint_id: str,
    body: WebhookEndpointPatch,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> WebhookEndpointResponse:
    _require_admin(user)
    ep = await db.get(WebhookEndpoint, endpoint_id)
    if ep is None or ep.company_id != company_id:
        raise HTTPException(404, "Endpoint not found")
    fields = body.model_dump(exclude_unset=True)
    if "url" in fields and fields["url"] is not None:
        ep.url = str(fields["url"])
    if "events" in fields and fields["events"] is not None:
        ep.events = fields["events"]
    if "active" in fields and fields["active"] is not None:
        ep.active = fields["active"]
    await db.commit()
    await db.refresh(ep)
    return _to_response(ep)


@router.delete(
    "/{endpoint_id}",
    status_code=204,
    summary="endpoint 삭제",
    responses={403: {"description": "admin 아님"}, 404: {"description": "없음"}},
)
async def delete_endpoint(
    endpoint_id: str,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> None:
    _require_admin(user)
    ep = await db.get(WebhookEndpoint, endpoint_id)
    if ep is None or ep.company_id != company_id:
        raise HTTPException(404, "Endpoint not found")
    await db.delete(ep)
    await db.commit()


@router.get(
    "/{endpoint_id}/deliveries",
    response_model=WebhookDeliveryList,
    summary="최근 50건 전송 기록 (디버깅)",
    responses={403: {"description": "admin 아님"}, 404: {"description": "endpoint 없음"}},
)
async def list_deliveries(
    endpoint_id: str,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> WebhookDeliveryList:
    _require_admin(user)
    ep = await db.get(WebhookEndpoint, endpoint_id)
    if ep is None or ep.company_id != company_id:
        raise HTTPException(404, "Endpoint not found")
    stmt = (
        select(WebhookDelivery)
        .where(WebhookDelivery.endpoint_id == ep.id)
        .order_by(WebhookDelivery.created_at.desc())
        .limit(50)
    )
    rows = list((await db.execute(stmt)).scalars().all())
    return WebhookDeliveryList(
        deliveries=[
            WebhookDeliveryResponse.model_validate(r, from_attributes=True)
            for r in rows
        ]
    )
