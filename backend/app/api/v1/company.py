"""/api/v1/me/company — 본인이 속한 active company 의 멤버 검색.

share/invite 시 grantee/invitee 를 sub 로 직접 입력하지 않게 하는 자동완성 백엔드.
"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import get_current_user, require_active_company
from app.core.db import get_db
from app.models.user import User
from app.models.user_company_membership import UserCompanyMembership


class CompanyMember(BaseModel):
    sub: str
    email: str
    name: str | None


class CompanyMembersResponse(BaseModel):
    members: list[CompanyMember]


router = APIRouter(prefix="/me/company", tags=["company"])


@router.get(
    "/members",
    response_model=CompanyMembersResponse,
    summary="회사 멤버 자동완성 검색",
)
async def search_members(
    q: str = Query(
        "", max_length=128, description="email/name ILIKE 매칭. 빈 값이면 최근 정렬."
    ),
    limit: int = Query(10, ge=1, le=50),
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> CompanyMembersResponse:
    """active company 멤버 ILIKE 검색 — email · name 매칭. 본인은 결과에서 제외.

    q 가 비면 최근 활성 멤버 limit 만큼 반환 (단순 정렬: email asc).
    캐시는 한 번 로그인한 사용자만 보유하므로, 한 번도 안 들어온 멤버는 안 보임.
    """
    conds = [
        UserCompanyMembership.company_id == company_id,
        UserCompanyMembership.user_sub != user.sub,
    ]
    if q:
        pattern = f"%{q}%"
        conds.append(or_(User.email.ilike(pattern), User.name.ilike(pattern)))

    stmt = (
        select(User)
        .join(
            UserCompanyMembership,
            UserCompanyMembership.user_sub == User.id,
        )
        .where(and_(*conds))
        .order_by(User.email)
        .limit(limit)
    )
    rows = list((await db.execute(stmt)).scalars().all())
    return CompanyMembersResponse(
        members=[
            CompanyMember(sub=r.id, email=r.email, name=r.name) for r in rows
        ]
    )
