"""/api/v1/me/activity: 본인 관련 audit_log 타임라인.

본인 관련 = 본인이 한 행동 OR 본인이 받은 알림에 연결된 entity.
관리자 전체 audit 와 달리 일반 사용자가 볼 수 있음.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import get_current_user, require_active_company
from app.core.db import get_db
from app.models.audit_log import AuditLog
from app.models.notification import Notification
from app.models.user import User
from app.services.audit import FILE_ACCESS


class ActivityItem(BaseModel):
    id: str
    actor_sub: str | None
    actor_name: str | None  # users 캐시에서 표시명: 없으면 None (UI fallback 처리)
    action: str
    entity_type: str
    entity_id: str
    meta: dict
    created_at: datetime


class ActivityResponse(BaseModel):
    items: list[ActivityItem]


router = APIRouter(prefix="/me", tags=["activity"])


@router.get(
    "/activity",
    response_model=ActivityResponse,
    summary="본인 활동 타임라인",
)
async def my_activity(
    limit: int = Query(50, ge=1, le=200),
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> ActivityResponse:
    # 본인이 받은 알림에 연결된 entity_id 집합: 본인이 영향받은 변경 추적
    notif_entity_ids_stmt = select(Notification.entity_id).where(
        and_(
            Notification.recipient_sub == user.sub,
            Notification.company_id == company_id,
        )
    )
    notif_ids = {
        row[0] for row in (await db.execute(notif_entity_ids_stmt)).all()
    }

    # 열람 기록은 활동 내역에서 뺀다: 양이 많아 실제 변경 활동을 밀어낸다 (감사로그 화면 전용).
    conds = [AuditLog.company_id == company_id, AuditLog.entity_type != FILE_ACCESS]
    if notif_ids:
        conds.append(
            or_(AuditLog.actor_sub == user.sub, AuditLog.entity_id.in_(notif_ids))
        )
    else:
        conds.append(AuditLog.actor_sub == user.sub)

    stmt = (
        select(AuditLog)
        .where(and_(*conds))
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    rows = list((await db.execute(stmt)).scalars().all())

    # actor 표시명 한 번에 조회: N+1 회피
    actor_subs = {r.actor_sub for r in rows if r.actor_sub}
    names: dict[str, str | None] = {}
    if actor_subs:
        for u in (
            await db.execute(select(User).where(User.id.in_(actor_subs)))
        ).scalars():
            names[u.id] = u.name or u.email or u.id

    return ActivityResponse(
        items=[
            ActivityItem(
                id=r.id,
                actor_sub=r.actor_sub,
                actor_name=names.get(r.actor_sub) if r.actor_sub else None,
                action=r.action,
                entity_type=r.entity_type,
                entity_id=r.entity_id,
                meta=r.meta,
                created_at=r.created_at,
            )
            for r in rows
        ]
    )
