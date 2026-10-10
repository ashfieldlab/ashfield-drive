"""/api/v1/workspaces/{id}/members: Workspace Admin 의 멤버 조회 + 저장 한도 설정.

System Admin 도 통과 (require_workspace_admin super-set). 다른 워크스페이스 침범은 path
검증으로 막힘.

멤버 추가, 제거, 역할 변경은 Ashfield 계정 서버에서 한다 (ADR-0024): 앱의 멤버십은
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
from app.auth.dependencies import require_workspace_admin
from app.core.db import get_db
from app.core.logging import logger
from app.models.user import User
from app.models.user_quota import UserQuota
from app.models.user_workspace_membership import UserWorkspaceMembership
from app.models.workspace import Workspace
from app.services.audit import write_audit
from app.services.quotas import (
    compute_user_usage,
    compute_user_usages,
    compute_user_version_usage,
    compute_user_version_usages,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/members", tags=["workspace"])

WorkspaceRole = Literal["admin", "member"]


class MemberItem(BaseModel):
    user_sub: str
    email: str | None
    name: str | None
    role: WorkspaceRole
    storage_bytes_used: int = 0
    storage_bytes_limit: int | None = None  # None = 무제한


class MemberListResponse(BaseModel):
    # 계정 서버 워크스페이스 ID. NULL = 로컬(레거시) 워크스페이스: 계정 서버에서 관리할 수 없음.
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
    summary="워크스페이스 멤버 + role 목록 (Workspace Admin)",
)
async def list_members(
    workspace_id: str = Path(...),
    _: UserContext = Depends(require_workspace_admin),
    db: AsyncSession = Depends(get_db),
) -> MemberListResponse:
    workspace = await db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(404, "Workspace not found")
    stmt = (
        select(UserWorkspaceMembership, User)
        .join(User, User.id == UserWorkspaceMembership.user_sub)
        .where(UserWorkspaceMembership.workspace_id == workspace_id)
        .order_by(UserWorkspaceMembership.role.desc(), User.name)
    )
    rows = (await db.execute(stmt)).all()
    usages = await compute_user_usages(db, workspace_id=workspace_id)
    # 버전도 한도에 포함 (ADR-0022)
    for sub, b in (await compute_user_version_usages(db, workspace_id=workspace_id)).items():
        usages[sub] = usages.get(sub, 0) + b
    limits = {
        q.user_sub: q.storage_bytes_limit
        for q in (
            await db.execute(
                select(UserQuota).where(UserQuota.workspace_id == workspace_id)
            )
        ).scalars()
    }
    return MemberListResponse(
        account_workspace_id=workspace.account_workspace_id,
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
    db: AsyncSession, workspace_id: str, user_sub: str
) -> int | None:
    q = await db.get(UserQuota, (workspace_id, user_sub))
    return q.storage_bytes_limit if q else None


@router.put(
    "/{user_sub}/quota",
    response_model=MemberItem,
    summary="멤버 저장 한도 설정 (Workspace Admin)",
    responses={404: {"description": "멤버십 없음"}},
)
async def put_member_quota(
    body: MemberQuotaPatch,
    workspace_id: str = Path(...),
    user_sub: str = Path(...),
    actor: UserContext = Depends(require_workspace_admin),
    db: AsyncSession = Depends(get_db),
) -> MemberItem:
    membership = await db.get(UserWorkspaceMembership, (user_sub, workspace_id))
    if membership is None:
        raise HTTPException(404, "Membership not found")
    q = await db.get(UserQuota, (workspace_id, user_sub))
    is_new = q is None
    if q is None:
        q = UserQuota(
            workspace_id=workspace_id,
            user_sub=user_sub,
            storage_bytes_limit=body.storage_bytes_limit,
        )
        db.add(q)
    else:
        q.storage_bytes_limit = body.storage_bytes_limit
    await write_audit(
        db,
        workspace_id=workspace_id,
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
            "workspace_id": workspace_id,
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
            db, workspace_id=workspace_id, user_sub=user_sub
        )
        + await compute_user_version_usage(db, workspace_id=workspace_id, user_sub=user_sub),
        storage_bytes_limit=body.storage_bytes_limit,
    )
