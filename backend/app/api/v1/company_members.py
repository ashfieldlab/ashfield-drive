"""/api/v1/companies/{id}/members — Company Admin 이 자기 회사 멤버·role 관리.

System Admin 도 통과 (require_company_admin super-set). 다른 회사 침범은 path
검증으로 막힘.

전역 사용자 검색·초대 같은 더 큰 권한 (Keycloak Admin API 호출) 은 도입 안 함 —
멤버는 여전히 lazy upsert 로만 생성 (그 회사 group 로 한 번 로그인하면 row 생김).
여기서 가능한 건 그 사람 의 role 변경뿐.
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
    members: list[MemberItem]


class RolePatch(BaseModel):
    role: CompanyRole


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
    if await db.get(Company, company_id) is None:
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


@router.patch(
    "/{user_sub}",
    response_model=MemberItem,
    summary="멤버 role 변경 (Company Admin)",
    responses={404: {"description": "멤버십 없음"}},
)
async def patch_member_role(
    body: RolePatch,
    company_id: str = Path(...),
    user_sub: str = Path(...),
    actor: UserContext = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
) -> MemberItem:
    membership = await db.get(UserCompanyMembership, (user_sub, company_id))
    if membership is None:
        raise HTTPException(404, "Membership not found")
    if membership.role == body.role:
        user = await db.get(User, user_sub)
        return MemberItem(
            user_sub=user_sub,
            email=user.email if user else None,
            name=user.name if user else None,
            role=membership.role,  # type: ignore[arg-type]
        )
    prev = membership.role
    membership.role = body.role
    await write_audit(
        db,
        company_id=company_id,
        actor=actor,
        action="update",
        entity_type="company_membership",
        entity_id=user_sub,
        meta={"role_from": prev, "role_to": body.role},
    )
    await db.commit()
    logger.info(
        "company_member_role_changed_by_company_admin",
        extra={
            "category": "authz",
            "company_id": company_id,
            "user_sub": user_sub,
            "role_from": prev,
            "role_to": body.role,
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
        storage_bytes_limit=await _member_limit(db, company_id, user_sub),
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
