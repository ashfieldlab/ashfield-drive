"""GET /api/v1/me — 현재 사용자 정보 반환.

JWT 검증 → 로컬 사용자·소속 준비(첫 로그인 시 개인 워크스페이스 생성) 흐름을
한 번에 시연하는 가장 단순한 라우트.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import get_current_user, require_active_company
from app.core.db import get_db
from app.models.company import Company
from app.models.user import User
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
        401: {"description": "JWT 없음·만료·서명 불일치"},
        403: {"description": "ALLOWED_EMAILS 에 없는 이메일"},
    },
)
async def get_me(
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """신원 + 우리 DB 의 소속 회사·role.

    부수효과: 첫 호출이면 `users` 행과 개인 워크스페이스(회사 + admin 멤버십)가 생긴다.
    groups: 소속 회사 ID 목록. companies: 같은 목록의 {id, name} (표시용).
    company_roles: 회사별 role (ADR-0010, frontend isCompanyAdmin 계산용).
    """
    rows = (
        await db.execute(
            select(
                UserCompanyMembership.company_id,
                UserCompanyMembership.role,
                Company.name,
            )
            .join(Company, Company.id == UserCompanyMembership.company_id)
            .where(UserCompanyMembership.user_sub == user.sub)
            .order_by(Company.name, Company.id)
        )
    ).all()
    company_roles: dict[str, str] = {cid: role for cid, role, _ in rows}
    me = await db.get(User, user.sub)
    return {
        "sub": user.sub,
        "email": user.email,
        "name": user.name,
        "image": me.image if me else None,
        "groups": user.groups,
        "companies": [{"id": cid, "name": name} for cid, _, name in rows],
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
