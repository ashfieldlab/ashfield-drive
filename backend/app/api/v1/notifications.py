"""/api/v1/notifications: in-app 알림 조회/읽음 + 이메일 수신 설정.

알림은 본인이 한 행동이 아닌 변경에 대해 자동 발생:
  - `node_shared`: 누가 본인에게 파일/폴더 공유

각 알림은 (1) DB row (in-app) (2) 매칭 Webhook fan-out (3) 이메일 (opt-out 가능) 3채널.
이메일은 `smtp_enabled=true` + `email_enabled=true` 일 때만.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import get_current_user, require_active_company
from app.core.db import get_db
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import (
    EmailPreferencePatch,
    EmailPreferenceResponse,
    MarkAllReadResponse,
    NotificationListResponse,
    NotificationPatch,
    NotificationResponse,
)
from app.services.email import get_or_create_pref

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _to_response(n: Notification, actor_name: str | None = None) -> NotificationResponse:
    return NotificationResponse(
        id=n.id,
        type=n.type,
        actor_sub=n.actor_sub,
        actor_name=actor_name,
        entity_type=n.entity_type,
        entity_id=n.entity_id,
        payload=n.payload,
        read_at=n.read_at,
        created_at=n.created_at,
    )


async def _actor_names(db: AsyncSession, subs: set[str]) -> dict[str, str | None]:
    if not subs:
        return {}
    names: dict[str, str | None] = {}
    for u in (await db.execute(select(User).where(User.id.in_(subs)))).scalars():
        names[u.id] = u.name or u.email or u.id
    return names


@router.get(
    "",
    response_model=NotificationListResponse,
    summary="알림 목록 + 안읽음 카운트",
)
async def list_notifications(
    unread_only: bool = Query(False, description="true 면 안읽음만"),
    entity_types: list[str] | None = Query(
        None,
        description="지정 시 해당 entity_type 만 (앱 스코프). 미지정이면 전체.",
    ),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, description="페이지네이션 오프셋 (히스토리 페이지 '더 보기')"),
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> NotificationListResponse:
    conds = [
        Notification.recipient_sub == user.sub,
        Notification.company_id == company_id,
    ]
    if entity_types:
        conds.append(Notification.entity_type.in_(entity_types))
    list_conds = [*conds]
    if unread_only:
        list_conds.append(Notification.read_at.is_(None))

    # limit+1 조회로 다음 페이지 존재 여부 판단 (별도 count 쿼리 회피).
    stmt = (
        select(Notification)
        .where(and_(*list_conds))
        .order_by(Notification.created_at.desc())
        .limit(limit + 1)
        .offset(offset)
    )
    rows = list((await db.execute(stmt)).scalars().all())
    has_more = len(rows) > limit
    rows = rows[:limit]

    # 안읽음 카운트는 앱 스코프(entity_types)는 반영하되 unread_only 와 무관하게 항상 계산.
    unread_stmt = select(func.count()).where(
        and_(*conds, Notification.read_at.is_(None))
    )
    unread_count = (await db.execute(unread_stmt)).scalar_one()

    names = await _actor_names(db, {r.actor_sub for r in rows if r.actor_sub})
    return NotificationListResponse(
        notifications=[
            _to_response(r, names.get(r.actor_sub) if r.actor_sub else None)
            for r in rows
        ],
        unread_count=int(unread_count),
        has_more=has_more,
    )


@router.get(
    "/preferences",
    response_model=EmailPreferenceResponse,
    summary="이메일 알림 수신 설정 조회",
)
async def get_preferences(
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EmailPreferenceResponse:
    pref = await get_or_create_pref(db, user_sub=user.sub)
    await db.commit()
    await db.refresh(pref)
    return EmailPreferenceResponse(
        email_enabled=pref.email_enabled, email_categories=pref.email_categories
    )


@router.patch(
    "/preferences",
    response_model=EmailPreferenceResponse,
    summary="이메일 알림 수신 토글 (마스터 + 카테고리별)",
)
async def patch_preferences(
    body: EmailPreferencePatch,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EmailPreferenceResponse:
    pref = await get_or_create_pref(db, user_sub=user.sub)
    if body.email_enabled is not None:
        pref.email_enabled = body.email_enabled
    if body.email_categories is not None:
        # 넘어온 키만 병합: 새 dict 재할당으로 ORM 변경 감지.
        pref.email_categories = {**(pref.email_categories or {}), **body.email_categories}
    await db.commit()
    await db.refresh(pref)
    return EmailPreferenceResponse(
        email_enabled=pref.email_enabled, email_categories=pref.email_categories
    )


@router.patch(
    "/{notification_id}",
    response_model=NotificationResponse,
    summary="단건 읽음 토글",
    responses={404: {"description": "본인 알림 아님 또는 없음"}},
)
async def patch_notification(
    notification_id: str,
    body: NotificationPatch,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> NotificationResponse:
    n = await db.get(Notification, notification_id)
    if (
        n is None
        or n.recipient_sub != user.sub
        or n.company_id != company_id
    ):
        raise HTTPException(404, "Notification not found")
    n.read_at = datetime.now(UTC) if body.read else None
    await db.commit()
    await db.refresh(n)
    names = await _actor_names(db, {n.actor_sub} if n.actor_sub else set())
    return _to_response(n, names.get(n.actor_sub) if n.actor_sub else None)


@router.post(
    "/mark-all-read",
    response_model=MarkAllReadResponse,
    summary="모든 알림 읽음 처리",
)
async def mark_all_read(
    entity_types: list[str] | None = Query(
        None,
        description="지정 시 해당 entity_type 알림만 읽음 처리 (앱 스코프). "
        "미지정이면 전체.",
    ),
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> MarkAllReadResponse:
    now = datetime.now(UTC)
    conds = [
        Notification.recipient_sub == user.sub,
        Notification.company_id == company_id,
        Notification.read_at.is_(None),
    ]
    # 뱃지·목록이 현재 앱 알림만 보여주므로, "모두 읽음"도 그 앱 범위만
    # 처리해야 함: 안 그러면 안 본 다른 앱 알림까지 읽음 처리되어 놓친다.
    if entity_types:
        conds.append(Notification.entity_type.in_(entity_types))
    stmt = update(Notification).where(and_(*conds)).values(read_at=now)
    result = await db.execute(stmt)
    await db.commit()
    return MarkAllReadResponse(marked=result.rowcount or 0)
