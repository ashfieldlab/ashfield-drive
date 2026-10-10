"""/api/v1/companies/{id}/members: Company Admin 의 멤버 조회 + 저장 한도 설정.

System Admin 도 통과 (require_company_admin super-set). 다른 회사 침범은 path
검증으로 막힘.

멤버 추가·제거·역할 변경은 Ashfield 계정 서버에서 한다 (ADR-0024): 앱의 멤버십은
토큰 `workspaces` 클레임으로 동기화되는 캐시다. 응답의 account_workspace_id 로
프론트가 계정 서버 워크스페이스 화면(`${ACCOUNT_URL}/workspaces/{id}`) 링크를 만든다.
목록은 이 앱에 한 번 이상 접속한 멤버만 담는다. 저장 한도(quota)는 앱 고유 설정이라 여기 남는다.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import require_company_admin
from app.core.db import get_db
from app.core.logging import logger
from app.models.company import Company
from app.models.user import User
from app.models.user_company_membership import UserCompanyMembership
from app.models.user_quota import UserQuota
from app.services.audit import write_audit
from app.services.quotas import (
    compute_user_usage,
    compute_user_usages,
    compute_user_version_usage,
    compute_user_version_usages,
)

router = APIRouter(prefix="/companies/{company_id}/members", tags=["company"])

CompanyRole = Literal["admin", "member"]


class MemberItem(BaseModel):
    user_sub: str
    email: str | None
    name: str | None
    role: CompanyRole
    storage_bytes_used: int = 0
    storage_bytes_limit: int | None = None  # None = 무제한


class MemberListResponse(BaseModel):
    # 계정 서버 워크스페이스 ID. NULL = 로컬(레거시) 회사: 계정 서버에서 관리할 수 없음.
    account_workspace_id: str | None = None
    members: list[MemberItem]


class MemberQuotaPatch(BaseModel):
    storage_bytes_limit: int | None = Field(
        default=None,
        ge=0,
        description="None = 무제한. 0 = 새 업로드 전부 차단.",
    )


@router.get(
    "",
    response_model=MemberListResponse,
    summary="회사 멤버 + role 목록 (Company Admin)",
)
async def list_members(
    company_id: str = Path(...),
    _: UserContext = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
) -> MemberListResponse:
    company = await db.get(Company, company_id)
    if company is None:
        raise HTTPException(404, "Company not found")
    stmt = (
        select(UserCompanyMembership, User)
        .join(User, User.id == UserCompanyMembership.user_sub)
        .where(UserCompanyMembership.company_id == company_id)
        .order_by(UserCompanyMembership.role.desc(), User.name)
    )
    rows = (await db.execute(stmt)).all()
    usages = await compute_user_usages(db, company_id=company_id)
    # 버전도 한도에 포함 (ADR-0022)
    for sub, b in (await compute_user_version_usages(db, company_id=company_id)).items():
        usages[sub] = usages.get(sub, 0) + b
    limits = {
        q.user_sub: q.storage_bytes_limit
        for q in (
            await db.execute(
                select(UserQuota).where(UserQuota.company_id == company_id)
            )
        ).scalars()
    }
    return MemberListResponse(
        account_workspace_id=company.account_workspace_id,
        members=[
            MemberItem(
                user_sub=m.user_sub,
                email=u.email,
                name=u.name,
                role=m.role,  # type: ignore[arg-type]
                storage_bytes_used=usages.get(m.user_sub, 0),
                storage_bytes_limit=limits.get(m.user_sub),
            )
            for m, u in rows
        ]
    )


async def _member_limit(
    db: AsyncSession, company_id: str, user_sub: str
) -> int | None:
    q = await db.get(UserQuota, (company_id, user_sub))
    return q.storage_bytes_limit if q else None


@router.put(
    "/{user_sub}/quota",
    response_model=MemberItem,
    summary="멤버 저장 한도 설정 (Company Admin)",
    responses={404: {"description": "멤버십 없음"}},
)
async def put_member_quota(
    body: MemberQuotaPatch,
    company_id: str = Path(...),
    user_sub: str = Path(...),
    actor: UserContext = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
) -> MemberItem:
    membership = await db.get(UserCompanyMembership, (user_sub, company_id))
    if membership is None:
        raise HTTPException(404, "Membership not found")
    q = await db.get(UserQuota, (company_id, user_sub))
    is_new = q is None
    if q is None:
        q = UserQuota(
            company_id=company_id,
            user_sub=user_sub,
            storage_bytes_limit=body.storage_bytes_limit,
        )
        db.add(q)
    else:
        q.storage_bytes_limit = body.storage_bytes_limit
    await write_audit(
        db,
        company_id=company_id,
        actor=actor,
        action="create" if is_new else "update",
        entity_type="user_quota",
        entity_id=user_sub,
        meta={"storage_bytes_limit": body.storage_bytes_limit},
    )
    await db.commit()
    logger.info(
        "member_quota_set",
        extra={
            "category": "biz",
            "company_id": company_id,
            "user_sub": user_sub,
            "storage_bytes_limit": body.storage_bytes_limit,
            "actor": actor.sub,
        },
    )
    user = await db.get(User, user_sub)
    return MemberItem(
        user_sub=user_sub,
        email=user.email if user else None,
        name=user.name if user else None,
        role=membership.role,  # type: ignore[arg-type]
        storage_bytes_used=await compute_user_usage(
            db, company_id=company_id, user_sub=user_sub
        )
        + await compute_user_version_usage(db, company_id=company_id, user_sub=user_sub),
        storage_bytes_limit=body.storage_bytes_limit,
    )
