"""GET /api/v1/me: 현재 사용자 정보 반환.

JWT 검증 → 로컬 사용자와 소속 동기화(토큰 `workspaces` 클레임, ADR-0024) 흐름을
한 번에 시연하는 가장 단순한 라우트.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import get_current_user, require_active_workspace
from app.core.db import get_db
from app.models.user import User
from app.models.user_workspace_membership import UserWorkspaceMembership
from app.models.workspace import Workspace
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
    # 개인 한도. None = 개인 무제한(워크스페이스 한도만 적용).
    storage_bytes_limit: int | None
    storage_pct: float | None  # None = 무제한
    # 워크스페이스 전체 한도 (참고용: 개인 무제한이어도 워크스페이스 한도엔 걸릴 수 있음).
    workspace_bytes_limit: int | None


@router.get(
    "/me",
    summary="현재 사용자 정보",
    responses={
        401: {"description": "JWT 없음, 만료, 서명, iss, aud 불일치"},
    },
)
async def get_me(
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """신원 + 우리 DB 의 소속 워크스페이스와 role.

    부수효과: `users` 행 upsert, 토큰 `workspaces` 가 바뀌었으면 워크스페이스와 멤버십 동기화.
    groups: 소속 워크스페이스 ID 목록. workspaces: 같은 목록의 {id, name, account_workspace_id}
    (account_workspace_id = 계정 서버 워크스페이스 ID, 로컬 레거시 워크스페이스는 null).
    workspace_roles: 워크스페이스별 role (ADR-0010, frontend isWorkspaceAdmin 계산용).
    """
    rows = (
        await db.execute(
            select(
                UserWorkspaceMembership.workspace_id,
                UserWorkspaceMembership.role,
                Workspace.name,
                Workspace.account_workspace_id,
            )
            .join(Workspace, Workspace.id == UserWorkspaceMembership.workspace_id)
            .where(UserWorkspaceMembership.user_sub == user.sub)
            .order_by(Workspace.name, Workspace.id)
        )
    ).all()
    workspace_roles: dict[str, str] = {cid: role for cid, role, _, _ in rows}
    me = await db.get(User, user.sub)
    return {
        "sub": user.sub,
        "email": user.email,
        "name": user.name,
        "image": me.image if me else None,
        "groups": user.groups,
        "workspaces": [
            {"id": cid, "name": name, "account_workspace_id": awid}
            for cid, _, name, awid in rows
        ],
        "roles": user.roles,
        "is_system_admin": user.is_system_admin,
        "workspace_roles": workspace_roles,
    }


@router.get(
    "/me/storage",
    response_model=MyStorageResponse,
    summary="내 저장 사용량과 한도 (활성 워크스페이스 기준)",
)
async def get_my_storage(
    user: UserContext = Depends(get_current_user),
    workspace_id: str = Depends(require_active_workspace),
    db: AsyncSession = Depends(get_db),
) -> MyStorageResponse:
    versions = await compute_user_version_usage(
        db, workspace_id=workspace_id, user_sub=user.sub
    )
    used = versions + await compute_user_usage(
        db, workspace_id=workspace_id, user_sub=user.sub
    )
    limit = await get_user_limit(
        db, workspace_id=workspace_id, user_sub=user.sub
    )
    workspace_limit = await get_limit(db, workspace_id=workspace_id)
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
        workspace_bytes_limit=workspace_limit,
    )
