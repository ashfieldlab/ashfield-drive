"""GET /api/v1/me — 현재 사용자 정보 반환.

JWT 검증·revocation·lazy upsert 흐름을 한 번에 시연하는 가장 단순한 라우트.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import get_current_user, require_active_company
from app.core.db import get_db
from app.models.user_company_membership import UserCompanyMembership
from app.services.quotas import (
    compute_user_usage,
    compute_user_version_usage,
    get_limit,
    get_user_limit,
)

router = APIRouter()


class MyStorageResponse(BaseModel):
    # 파일 + 버전 합계 (ADR-0022: 버전도 한도에 포함).
    storage_bytes_used: int
    # 그중 버전이 차지하는 몫.
    version_bytes_used: int = 0
    # 개인 한도. None = 개인 무제한(회사 한도만 적용).
    storage_bytes_limit: int | None
    storage_pct: float | None  # None = 무제한
    # 회사 전체 한도 (참고용 — 개인 무제한이어도 회사 한도엔 걸릴 수 있음).
    company_bytes_limit: int | None


@router.get(
    "/me",
    summary="현재 사용자 정보",
    responses={
        401: {"description": "JWT 없음·만료·서명 불일치 또는 revoked sid"},
    },
)
async def get_me(
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """JWT claims + 우리 DB 의 회사 role.

    부수효과: `users` 캐시·회사 멤버십 lazy upsert (5분 throttle).
    company_roles: 사용자가 admin 인 회사 목록 매핑 (ADR-0010, frontend isCompanyAdmin 계산용).
    """
    rows = (
        await db.execute(
            select(
                UserCompanyMembership.company_id, UserCompanyMembership.role
            ).where(UserCompanyMembership.user_sub == user.sub)
        )
    ).all()
    company_roles: dict[str, str] = {cid: role for cid, role in rows}
    return {
        "sub": user.sub,
        "email": user.email,
        "name": user.name,
        "groups": user.groups,
        "roles": user.roles,
        "is_system_admin": user.is_system_admin,
        "company_roles": company_roles,
    }


@router.get(
    "/me/storage",
    response_model=MyStorageResponse,
    summary="내 저장 사용량·한도 (활성 회사 기준)",
)
async def get_my_storage(
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> MyStorageResponse:
    versions = await compute_user_version_usage(
        db, company_id=company_id, user_sub=user.sub
    )
    used = versions + await compute_user_usage(
        db, company_id=company_id, user_sub=user.sub
    )
    limit = await get_user_limit(
        db, company_id=company_id, user_sub=user.sub
    )
    company_limit = await get_limit(db, company_id=company_id)
    pct: float | None = None
    if limit is not None and limit > 0:
        pct = used / limit
    elif limit == 0:
        pct = 1.0 if used > 0 else 0.0
    return MyStorageResponse(
        storage_bytes_used=used,
        version_bytes_used=versions,
        storage_bytes_limit=limit,
        storage_pct=pct,
        company_bytes_limit=company_limit,
    )
