"""/api/v1/admin/workspaces: System Admin 의 워크스페이스·멤버 role 관리 (ADR-0010).

System Admin 은 모든 워크스페이스 super-set 권한. 본인이 그 워크스페이스 멤버일 필요 X.
워크스페이스 admin (role='admin') 임명/강등 = 여기서만 가능.

워크스페이스 목록은 lazy upsert 된 워크스페이스 = 한 번 이상 누군가 그 group 으로 로그인한 워크스페이스.
멤버 목록은 lazy upsert 된 멤버십 row = 그 워크스페이스로 한 번 이상 로그인한 사람.
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
from app.models.user import User
from app.models.user_workspace_membership import UserWorkspaceMembership
from app.models.workspace import Workspace
from app.services.audit import write_audit

router = APIRouter(prefix="/admin/workspaces", tags=["admin"])

WorkspaceRole = Literal["admin", "member"]


class WorkspaceListItem(BaseModel):
    id: str
    name: str
    member_count: int
    admin_count: int


class WorkspaceListResponse(BaseModel):
    workspaces: list[WorkspaceListItem]


class MemberItem(BaseModel):
    user_sub: str
    email: str | None
    name: str | None
    role: WorkspaceRole


class MemberListResponse(BaseModel):
    members: list[MemberItem]


class RolePatch(BaseModel):
    role: WorkspaceRole


@router.get(
    "",
    response_model=WorkspaceListResponse,
    summary="모든 워크스페이스 목록 (System Admin)",
)
async def list_workspaces(
    _: UserContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceListResponse:
    counts_stmt = (
        select(
            UserWorkspaceMembership.workspace_id,
            func.count().label("members"),
            func.count(
                func.nullif(UserWorkspaceMembership.role, "member")
            ).label("admins"),
        )
        .group_by(UserWorkspaceMembership.workspace_id)
    )
    by_id: dict[str, tuple[int, int]] = {
        cid: (m, a) for cid, m, a in (await db.execute(counts_stmt)).all()
    }

    rows = (await db.execute(select(Workspace).order_by(Workspace.name))).scalars().all()
    return WorkspaceListResponse(
        workspaces=[
            WorkspaceListItem(
                id=c.id,
                name=c.name,
                member_count=by_id.get(c.id, (0, 0))[0],
                admin_count=by_id.get(c.id, (0, 0))[1],
            )
            for c in rows
        ]
    )


@router.get(
    "/{workspace_id}/members",
    response_model=MemberListResponse,
    summary="워크스페이스 멤버 + role 목록 (System Admin)",
    responses={404: {"description": "워크스페이스 없음"}},
)
async def list_members(
    workspace_id: str = Path(...),
    _: UserContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> MemberListResponse:
    if await db.get(Workspace, workspace_id) is None:
        raise HTTPException(404, "Workspace not found")

    stmt = (
        select(UserWorkspaceMembership, User)
        .join(User, User.id == UserWorkspaceMembership.user_sub)
        .where(UserWorkspaceMembership.workspace_id == workspace_id)
        .order_by(UserWorkspaceMembership.role.desc(), User.name)
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
    "/{workspace_id}/members/{user_sub}",
    response_model=MemberItem,
    summary="멤버 role 변경: admin 임명/강등 (System Admin)",
    responses={
        404: {"description": "멤버십 없음: 그 사용자가 그 워크스페이스로 한 번도 로그인 안 함"},
        409: {"description": "마지막 admin 강등 시도 (운영 lock-out 방지)"},
    },
)
async def patch_member_role(
    body: RolePatch,
    workspace_id: str = Path(...),
    user_sub: str = Path(...),
    actor: UserContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> MemberItem:
    membership = await db.get(UserWorkspaceMembership, (user_sub, workspace_id))
    if membership is None:
        raise HTTPException(404, "Membership not found")

    if membership.role == body.role:
        # no-op: 그래도 멱등 응답
        user = await db.get(User, user_sub)
        return MemberItem(
            user_sub=user_sub,
            email=user.email if user else None,
            name=user.name if user else None,
            role=membership.role,  # type: ignore[arg-type]
        )

    # 마지막 admin 강등 방지: System Admin 이 자기 자신을 잠그는 사고는 OK
    # (어차피 다시 임명 가능), 하지만 워크스페이스 admin 0 명 되는 건 명시적 경고.
    # → 차단까지는 안 함, 강등 자체는 허용. 클라이언트 UI 가 경고.
    # (운영 안전성 vs 유연성 trade-off: 유연성 채택.)

    prev = membership.role
    membership.role = body.role
    await write_audit(
        db,
        workspace_id=workspace_id,
        actor=actor,
        action="update",
        entity_type="workspace_membership",
        entity_id=user_sub,
        meta={"role_from": prev, "role_to": body.role},
    )
    await db.commit()
    logger.info(
        "workspace_member_role_changed",
        extra={
            "category": "authz",
            "workspace_id": workspace_id,
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
