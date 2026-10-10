"""팀 폴더 (Team folders): 부서 전용 공용 폴더 (docs/group-sharing.html 4단계).

현재 비활성: 부서 소스(외부 디렉터리)가 없어 새로 만들 수 없고 목록은 비어 있다
(app/services/departments.py, ADR-0023). 이미 있는 팀 폴더는 워크스페이스 admin 이 삭제할 수 있다.

생성/삭제는 워크스페이스 admin. 목록은 본인 접근집합(부서+조상)에 바인딩 부서가 드는 것만.
접근 권한 자체는 effective_permission 의 팀폴더 ACL 오버라이드가 처리.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import get_current_user, require_active_workspace
from app.core.db import get_db
from app.models.user_workspace_membership import UserWorkspaceMembership
from app.schemas.team_folder import TeamFolderCreate, TeamFolderResponse
from app.services import departments, team_folders
from app.services.audit import write_audit
from app.services.nodes import get_node_or_404

router = APIRouter(prefix="/team-folders", tags=["team-folders"])


async def _require_workspace_admin(
    db: AsyncSession, user: UserContext, workspace_id: str
) -> None:
    if user.is_system_admin:
        return
    m = await db.get(UserWorkspaceMembership, (user.sub, workspace_id))
    if m is None or m.role != "admin":
        raise HTTPException(403, "워크스페이스 관리자만 팀 폴더를 관리할 수 있습니다.")


@router.get("", response_model=list[TeamFolderResponse], summary="내 팀 폴더 목록")
async def list_my_team_folders(
    user: UserContext = Depends(get_current_user),
    workspace_id: str = Depends(require_active_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[TeamFolderResponse]:
    rows = await team_folders.list_workspace_team_folders(db, workspace_id=workspace_id)
    if not rows:
        return []
    access = await departments.access_department_ids(user, workspace_id)
    name_of = {
        d["department_id"]: d["department"]
        for d in await departments.list_departments(user, workspace_id)
    }
    return [
        TeamFolderResponse(
            node_id=node.id,
            name=node.name,
            department_id=tf.department_id,
            department_name=name_of.get(tf.department_id),
            created_by=tf.created_by,
            created_at=tf.created_at,
        )
        for node, tf in rows
        if tf.department_id in access
    ]


@router.post(
    "",
    response_model=TeamFolderResponse,
    status_code=201,
    summary="팀 폴더 생성 (워크스페이스 admin)",
    responses={403: {"description": "워크스페이스 admin 아님"}, 404: {"description": "부서 없음"}},
)
async def create_team_folder(
    body: TeamFolderCreate,
    user: UserContext = Depends(get_current_user),
    workspace_id: str = Depends(require_active_workspace),
    db: AsyncSession = Depends(get_db),
) -> TeamFolderResponse:
    await _require_workspace_admin(db, user, workspace_id)
    if not departments.groups_enabled():
        raise HTTPException(400, departments.GROUPS_DISABLED_DETAIL)
    # 부서가 이 워크스페이스에 실재하는지 검증 + 표시명 확보.
    depts = await departments.list_departments(user, workspace_id)
    match = next(
        (
            d
            for d in depts
            if d.get("department_id") == body.department_id
            and d.get("workspace") == workspace_id
        ),
        None,
    )
    if match is None:
        raise HTTPException(404, "해당 부서를 찾을 수 없습니다.")
    node, tf = await team_folders.create_team_folder(
        db,
        workspace_id=workspace_id,
        department_id=body.department_id,
        name=body.name,
        created_by=user.sub,
    )
    await write_audit(
        db,
        workspace_id=workspace_id,
        actor=user,
        action="create",
        entity_type="node",
        entity_id=node.id,
        meta={
            "team_folder": True,
            "department": body.department_id,
            "department_name": match.get("department"),
            "name": node.name,
        },
    )
    await db.commit()
    await db.refresh(node)
    await db.refresh(tf)
    return TeamFolderResponse(
        node_id=node.id,
        name=node.name,
        department_id=tf.department_id,
        department_name=match.get("department"),
        created_by=tf.created_by,
        created_at=tf.created_at,
    )


@router.delete(
    "/{node_id}",
    status_code=204,
    summary="팀 폴더 삭제 (워크스페이스 admin)",
    responses={403: {"description": "워크스페이스 admin 아님"}, 404: {"description": "팀 폴더 없음"}},
)
async def delete_team_folder(
    node_id: str,
    user: UserContext = Depends(get_current_user),
    workspace_id: str = Depends(require_active_workspace),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _require_workspace_admin(db, user, workspace_id)
    tf = await team_folders.get_team_folder(db, node_id)
    if tf is None or tf.workspace_id != workspace_id:
        raise HTTPException(404, "팀 폴더를 찾을 수 없습니다.")
    node = await get_node_or_404(db, node_id)
    # v1: 루트 soft-delete + 바인딩 제거 (휴지통으로). 하위 S3 정리는 추후.
    node.deleted_at = datetime.now(UTC)
    await db.delete(tf)
    await write_audit(
        db,
        workspace_id=workspace_id,
        actor=user,
        action="delete",
        entity_type="node",
        entity_id=node.id,
        meta={"team_folder": True},
    )
    await db.commit()
