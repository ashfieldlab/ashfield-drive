"""파일 버전 API (ADR-0022).

열람, 다운로드, 복원 = 쓰기 권한 이상, 삭제 = 관리 권한. 읽기 공유와 외부 링크로는
현재 내용만 보인다 (지운 내용이 공유받은 사람에게 새지 않게).
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import get_current_user, require_active_workspace
from app.core.config import settings
from app.core.db import get_db
from app.core.storage import presign_get
from app.models.file_version import FileVersion
from app.models.node import Node
from app.models.user import User
from app.schemas.file_version import FileVersionDownloadUrl, FileVersionResponse
from app.schemas.node import NodeResponse
from app.services import file_versions
from app.services.audit import record_file_access, write_audit
from app.services.node_view import to_response
from app.services.nodes import Permission, assert_access, get_node_or_404

router = APIRouter(prefix="/nodes/{node_id}/versions", tags=["file-versions"])


async def _file_node(
    db: AsyncSession, node_id: str, *, user: UserContext, workspace_id: str, permission: Permission
) -> Node:
    node = await get_node_or_404(db, node_id)
    await assert_access(db, node, user=user, workspace_id=workspace_id, permission=permission)
    if node.kind != "file":
        raise HTTPException(400, "Not a file")
    return node


async def _version(db: AsyncSession, node: Node, version_id: str) -> FileVersion:
    v = await db.get(FileVersion, version_id)
    if v is None or v.node_id != node.id:
        raise HTTPException(404, "Version not found")
    return v


@router.get("", response_model=list[FileVersionResponse], summary="버전 목록 (최신순)")
async def list_versions(
    node_id: str,
    user: UserContext = Depends(get_current_user),
    workspace_id: str = Depends(require_active_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[FileVersionResponse]:
    node = await _file_node(db, node_id, user=user, workspace_id=workspace_id, permission="write")
    rows = (
        await db.execute(
            select(FileVersion, User.name)
            .outerjoin(User, User.id == FileVersion.saved_by)
            .where(FileVersion.node_id == node.id)
            .order_by(FileVersion.created_at.desc())
        )
    ).all()
    return [
        FileVersionResponse(
            id=v.id,
            size_bytes=v.size_bytes,
            saved_by=v.saved_by,
            saved_by_name=name,
            saved_at=v.saved_at,
            created_at=v.created_at,
        )
        for v, name in rows
    ]


@router.post(
    "/{version_id}/download-url",
    response_model=FileVersionDownloadUrl,
    summary="버전 다운로드 presigned URL",
)
async def version_download_url(
    node_id: str,
    version_id: str,
    user: UserContext = Depends(get_current_user),
    workspace_id: str = Depends(require_active_workspace),
    db: AsyncSession = Depends(get_db),
) -> FileVersionDownloadUrl:
    node = await _file_node(db, node_id, user=user, workspace_id=workspace_id, permission="write")
    v = await _version(db, node, version_id)
    url = await presign_get(v.storage_key, download_name=node.name)
    await record_file_access(
        db, node, actor=user, kind="version_download", meta={"version_id": v.id}
    )
    return FileVersionDownloadUrl(
        url=url, expires_in=settings.presign_download_ttl_seconds, wrapped_dek=v.wrapped_dek
    )


@router.post(
    "/{version_id}/restore",
    response_model=NodeResponse,
    summary="버전 복원: 현재 내용은 새 버전으로 남고 이 버전이 현재가 된다",
    responses={409: {"description": "업로드나 교체가 진행 중인 파일"}},
)
async def restore_version(
    node_id: str,
    version_id: str,
    user: UserContext = Depends(get_current_user),
    workspace_id: str = Depends(require_active_workspace),
    db: AsyncSession = Depends(get_db),
) -> NodeResponse:
    node = await _file_node(db, node_id, user=user, workspace_id=workspace_id, permission="write")
    if node.status != "ready" or node.pending_storage_key:
        raise HTTPException(409, "File upload in progress")
    v = await _version(db, node, version_id)
    stale_keys = await file_versions.restore(db, node, v, actor=user, now=datetime.now(UTC))
    # 데스크톱 싱크는 감사로그의 node update 로 내용 변경을 감지한다 (/nodes/changes).
    await write_audit(
        db,
        workspace_id=workspace_id,
        actor=user,
        action="update",
        entity_type="node",
        entity_id=node.id,
        meta={
            "kind": "file",
            "name": node.name,
            "size": node.size_bytes,
            "overwrite": True,
            "restored_version": version_id,
        },
    )
    await db.commit()
    await db.refresh(node)
    await file_versions.delete_objects(stale_keys)
    return await to_response(db, node)


@router.delete("/{version_id}", status_code=204, summary="버전 삭제 (관리 권한)")
async def delete_version(
    node_id: str,
    version_id: str,
    user: UserContext = Depends(get_current_user),
    workspace_id: str = Depends(require_active_workspace),
    db: AsyncSession = Depends(get_db),
) -> Response:
    node = await _file_node(db, node_id, user=user, workspace_id=workspace_id, permission="manage")
    v = await _version(db, node, version_id)
    key = await file_versions.delete_version(db, v, actor=user)
    await db.commit()
    await file_versions.delete_objects([key])
    return Response(status_code=204)
