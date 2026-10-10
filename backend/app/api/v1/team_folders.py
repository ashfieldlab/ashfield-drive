"""팀 폴더 (Team folders) — 부서 전용 공용 폴더 (docs/group-sharing.html 4단계).

생성/삭제는 회사 admin. 목록은 본인 접근집합(부서+조상)에 바인딩 부서가 드는 것만.
접근 권한 자체는 effective_permission 의 팀폴더 ACL 오버라이드가 처리.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import get_current_user, require_active_company
from app.core.db import get_db
from app.models.user_company_membership import UserCompanyMembership
from app.schemas.team_folder import TeamFolderCreate, TeamFolderResponse
from app.services import external_directory, team_folders
from app.services.audit import write_audit
from app.services.nodes import get_node_or_404

router = APIRouter(prefix="/team-folders", tags=["team-folders"])


async def _require_company_admin(
    db: AsyncSession, user: UserContext, company_id: str
) -> None:
    if user.is_system_admin:
        return
    m = await db.get(UserCompanyMembership, (user.sub, company_id))
    if m is None or m.role != "admin":
        raise HTTPException(403, "회사 관리자만 팀 폴더를 관리할 수 있습니다.")


@router.get("", response_model=list[TeamFolderResponse], summary="내 팀 폴더 목록")
async def list_my_team_folders(
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> list[TeamFolderResponse]:
    rows = await team_folders.list_company_team_folders(db, company_id=company_id)
    if not rows:
        return []
    access = await external_directory.access_department_ids(user, company_id)
    name_of = {
        d["department_id"]: d["department"]
        for d in await external_directory.list_departments(user, company_id)
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
    summary="팀 폴더 생성 (회사 admin)",
    responses={403: {"description": "회사 admin 아님"}, 404: {"description": "부서 없음"}},
)
async def create_team_folder(
    body: TeamFolderCreate,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> TeamFolderResponse:
    await _require_company_admin(db, user, company_id)
    # 부서가 이 회사에 실재하는지 검증 + 표시명 확보.
    depts = await external_directory.list_departments(user, company_id)
    match = next(
        (
            d
            for d in depts
            if d.get("department_id") == body.department_id
            and d.get("company") == company_id
        ),
        None,
    )
    if match is None:
        raise HTTPException(404, "해당 부서를 찾을 수 없습니다.")
    node, tf = await team_folders.create_team_folder(
        db,
        company_id=company_id,
        department_id=body.department_id,
        name=body.name,
        created_by=user.sub,
    )
    await write_audit(
        db,
        company_id=company_id,
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
    summary="팀 폴더 삭제 (회사 admin)",
    responses={403: {"description": "회사 admin 아님"}, 404: {"description": "팀 폴더 없음"}},
)
async def delete_team_folder(
    node_id: str,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _require_company_admin(db, user, company_id)
    tf = await team_folders.get_team_folder(db, node_id)
    if tf is None or tf.company_id != company_id:
        raise HTTPException(404, "팀 폴더를 찾을 수 없습니다.")
    node = await get_node_or_404(db, node_id)
    # v1: 루트 soft-delete + 바인딩 제거 (휴지통으로). 하위 S3 정리는 추후.
    node.deleted_at = datetime.now(UTC)
    await db.delete(tf)
    await write_audit(
        db,
        company_id=company_id,
        actor=user,
        action="delete",
        entity_type="node",
        entity_id=node.id,
        meta={"team_folder": True},
    )
    await db.commit()
