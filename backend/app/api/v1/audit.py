"""/api/v1/audit — 감사 로그 조회.

접근:
  scope=company — 활성 회사의 감사 로그. 그 회사 admin(또는 System Admin).
  scope=system  — company_id NULL 인 시스템 레벨 로그. System Admin 만.

필터: 기간(from/to)·entity_type·action·actor_sub. CSV export 제공(같은 필터).
"""

import csv
import io
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import get_current_user, require_active_company
from app.core.db import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.user_company_membership import UserCompanyMembership
from app.schemas.audit import AuditLogListResponse, AuditLogResponse

router = APIRouter(prefix="/audit", tags=["audit"])

Scope = Literal["company", "system"]

# CSV export 상한 — 너무 큰 응답 방지.
_EXPORT_CAP = 10_000


async def _assert_scope_access(
    db: AsyncSession, *, user: UserContext, scope: Scope, company_id: str
) -> None:
    """scope=system 은 System Admin, scope=company 는 그 회사 admin."""
    if scope == "system":
        if not user.is_system_admin:
            raise HTTPException(403, "System admin only")
        return
    if user.is_system_admin:
        return
    membership = await db.get(UserCompanyMembership, (user.sub, company_id))
    if membership is None or membership.role != "admin":
        raise HTTPException(403, "Company admin only")


async def _query_logs(
    db: AsyncSession,
    *,
    scope: Scope,
    company_id: str,
    from_: datetime | None,
    to: datetime | None,
    entity_type: str | None,
    action: str | None,
    actor_sub: str | None,
    limit: int,
) -> list[AuditLog]:
    if scope == "system":
        conds = [AuditLog.company_id.is_(None)]
    else:
        conds = [AuditLog.company_id == company_id]
    if from_:
        conds.append(AuditLog.created_at >= from_)
    if to:
        conds.append(AuditLog.created_at < to)
    if entity_type:
        conds.append(AuditLog.entity_type == entity_type)
    if action:
        conds.append(AuditLog.action == action)
    if actor_sub:
        conds.append(AuditLog.actor_sub == actor_sub)
    stmt = (
        select(AuditLog)
        .where(and_(*conds))
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


async def _actor_names(
    db: AsyncSession, rows: list[AuditLog]
) -> dict[str, str | None]:
    subs = {r.actor_sub for r in rows if r.actor_sub}
    if not subs:
        return {}
    names: dict[str, str | None] = {}
    for u in (await db.execute(select(User).where(User.id.in_(subs)))).scalars():
        names[u.id] = u.name or u.email or u.id
    return names


@router.get(
    "",
    response_model=AuditLogListResponse,
    summary="감사 로그 조회 (회사 admin: 자기 회사 / system scope: System Admin)",
    responses={403: {"description": "권한 없음"}},
)
async def list_audit(
    from_: datetime | None = Query(None, alias="from", description="ISO datetime"),
    to: datetime | None = Query(None, description="ISO datetime (exclusive)"),
    entity_type: str | None = Query(
        None, description="`node` | `company` 등"
    ),
    action: str | None = Query(
        None, description="`create` | `update` | `delete` | `share` 등"
    ),
    actor_sub: str | None = Query(None, description="특정 사용자(sub)만"),
    scope: Scope = Query(
        "company",
        description="company=활성 회사 / system=company_id NULL 시스템 항목",
    ),
    limit: int = Query(100, ge=1, le=500),
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> AuditLogListResponse:
    await _assert_scope_access(
        db, user=user, scope=scope, company_id=company_id
    )
    rows = await _query_logs(
        db,
        scope=scope,
        company_id=company_id,
        from_=from_,
        to=to,
        entity_type=entity_type,
        action=action,
        actor_sub=actor_sub,
        limit=limit,
    )
    names = await _actor_names(db, rows)
    return AuditLogListResponse(
        logs=[
            AuditLogResponse(
                id=r.id,
                company_id=r.company_id,
                actor_sub=r.actor_sub,
                actor_name=names.get(r.actor_sub) if r.actor_sub else None,
                actor_type=r.actor_type,
                action=r.action,
                entity_type=r.entity_type,
                entity_id=r.entity_id,
                meta=r.meta,
                request_id=r.request_id,
                created_at=r.created_at,
            )
            for r in rows
        ]
    )


@router.get(
    "/export.csv",
    summary="감사 로그 CSV 내보내기 (같은 접근·필터)",
    responses={403: {"description": "권한 없음"}},
)
async def export_audit_csv(
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = Query(None),
    entity_type: str | None = Query(None),
    action: str | None = Query(None),
    actor_sub: str | None = Query(None),
    scope: Scope = Query("company"),
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await _assert_scope_access(
        db, user=user, scope=scope, company_id=company_id
    )
    rows = await _query_logs(
        db,
        scope=scope,
        company_id=company_id,
        from_=from_,
        to=to,
        entity_type=entity_type,
        action=action,
        actor_sub=actor_sub,
        limit=_EXPORT_CAP,
    )
    names = await _actor_names(db, rows)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        ["시각", "행위자", "유형", "액션", "대상유형", "대상ID", "request_id"]
    )
    for r in rows:
        writer.writerow(
            [
                r.created_at.isoformat(),
                (names.get(r.actor_sub) if r.actor_sub else None)
                or r.actor_sub
                or r.actor_type,
                r.actor_type,
                r.action,
                r.entity_type,
                r.entity_id,
                r.request_id or "",
            ]
        )
    # Excel 한글 깨짐 방지 — UTF-8 BOM.
    data = "﻿" + buf.getvalue()
    return Response(
        content=data,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="audit-log.csv"'
        },
    )
