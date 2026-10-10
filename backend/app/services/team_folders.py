"""Team folder 도메인 (docs/group-sharing.html 4단계).

팀 폴더 = shared scope 루트 폴더 + team_folders 바인딩(부서). effective_permission 이
그 서브트리를 "워크스페이스 전원 write" 대신 부서 ACL 로 오버라이드한다 (vault 의 부서판).
생성/삭제는 워크스페이스 admin. 멤버십은 디렉터리 부서를 동적으로 따라감.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.node import Node
from app.models.team_folder import TeamFolder
from app.services.nodes import new_node_id, resolve_name_conflict


async def create_team_folder(
    db: AsyncSession,
    *,
    workspace_id: str,
    department_id: str,
    name: str,
    created_by: str,
) -> tuple[Node, TeamFolder]:
    """shared 루트 폴더 + team_folders 바인딩 생성. commit 은 호출자."""
    resolved = await resolve_name_conflict(db, parent_id=None, name=name)
    node = Node(
        id=new_node_id(),
        kind="folder",
        name=resolved,
        parent_id=None,
        workspace_id=workspace_id,
        owner_id=created_by,
        scope="shared",
        status="ready",
    )
    db.add(node)
    binding = TeamFolder(
        node_id=node.id,
        workspace_id=workspace_id,
        department_id=department_id,
        created_by=created_by,
    )
    db.add(binding)
    return node, binding


async def list_workspace_team_folders(
    db: AsyncSession, *, workspace_id: str
) -> list[tuple[Node, TeamFolder]]:
    """워크스페이스의 모든 팀 폴더 (삭제 안 된 것). 접근집합 필터는 호출자."""
    stmt = (
        select(Node, TeamFolder)
        .join(TeamFolder, TeamFolder.node_id == Node.id)
        .where(
            TeamFolder.workspace_id == workspace_id,
            Node.deleted_at.is_(None),
        )
        .order_by(Node.name)
    )
    return [(n, t) for n, t in (await db.execute(stmt)).all()]


async def get_team_folder(db: AsyncSession, node_id: str) -> TeamFolder | None:
    return await db.get(TeamFolder, node_id)
