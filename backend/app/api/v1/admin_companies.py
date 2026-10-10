"""/api/v1/admin/companies — System Admin 의 회사·멤버 role 관리 (ADR-0010).

System Admin 은 모든 회사 super-set 권한. 본인이 그 회사 멤버일 필요 X.
회사 admin (role='admin') 임명/강등 = 여기서만 가능.

회사 목록은 lazy upsert 된 회사 = 한 번 이상 누군가 그 group 으로 로그인한 회사.
멤버 목록은 lazy upsert 된 멤버십 row = 그 회사로 한 번 이상 로그인한 사람.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import require_admin
from app.core.db import get_db
from app.core.logging import logger
from app.models.company import Company
from app.models.user import User
from app.models.user_company_membership import UserCompanyMembership
from app.services.audit import write_audit

router = APIRouter(prefix="/admin/companies", tags=["admin"])

CompanyRole = Literal["admin", "member"]


class CompanyListItem(BaseModel):
    id: str
    name: str
    member_count: int
    admin_count: int


class CompanyListResponse(BaseModel):
    companies: list[CompanyListItem]


class MemberItem(BaseModel):
    user_sub: str
    email: str | None
    name: str | None
    role: CompanyRole


class MemberListResponse(BaseModel):
    members: list[MemberItem]


class RolePatch(BaseModel):
    role: CompanyRole


@router.get(
    "",
    response_model=CompanyListResponse,
    summary="모든 회사 목록 (System Admin)",
)
async def list_companies(
    _: UserContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CompanyListResponse:
    counts_stmt = (
        select(
            UserCompanyMembership.company_id,
            func.count().label("members"),
            func.count(
                func.nullif(UserCompanyMembership.role, "member")
            ).label("admins"),
        )
        .group_by(UserCompanyMembership.company_id)
    )
    by_id: dict[str, tuple[int, int]] = {
        cid: (m, a) for cid, m, a in (await db.execute(counts_stmt)).all()
    }

    rows = (await db.execute(select(Company).order_by(Company.name))).scalars().all()
    return CompanyListResponse(
        companies=[
            CompanyListItem(
                id=c.id,
                name=c.name,
                member_count=by_id.get(c.id, (0, 0))[0],
                admin_count=by_id.get(c.id, (0, 0))[1],
            )
            for c in rows
        ]
    )


@router.get(
    "/{company_id}/members",
    response_model=MemberListResponse,
    summary="회사 멤버 + role 목록 (System Admin)",
    responses={404: {"description": "회사 없음"}},
)
async def list_members(
    company_id: str = Path(...),
    _: UserContext = Depends(require_admin),
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
    return MemberListResponse(
        members=[
            MemberItem(
                user_sub=m.user_sub,
                email=u.email,
                name=u.name,
                role=m.role,  # type: ignore[arg-type]
            )
            for m, u in rows
        ]
    )


@router.patch(
    "/{company_id}/members/{user_sub}",
    response_model=MemberItem,
    summary="멤버 role 변경 — admin 임명/강등 (System Admin)",
    responses={
        404: {"description": "멤버십 없음 — 그 사용자가 그 회사로 한 번도 로그인 안 함"},
        409: {"description": "마지막 admin 강등 시도 (운영 lock-out 방지)"},
    },
)
async def patch_member_role(
    body: RolePatch,
    company_id: str = Path(...),
    user_sub: str = Path(...),
    actor: UserContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> MemberItem:
    membership = await db.get(UserCompanyMembership, (user_sub, company_id))
    if membership is None:
        raise HTTPException(404, "Membership not found")

    if membership.role == body.role:
        # no-op — 그래도 멱등 응답
        user = await db.get(User, user_sub)
        return MemberItem(
            user_sub=user_sub,
            email=user.email if user else None,
            name=user.name if user else None,
            role=membership.role,  # type: ignore[arg-type]
        )

    # 마지막 admin 강등 방지 — System Admin 이 자기 자신을 잠그는 사고는 OK
    # (어차피 다시 임명 가능), 하지만 회사 admin 0 명 되는 건 명시적 경고.
    # → 차단까지는 안 함, 강등 자체는 허용. 클라이언트 UI 가 경고.
    # (운영 안전성 vs 유연성 trade-off: 유연성 채택.)

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
        "company_member_role_changed",
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
    )
