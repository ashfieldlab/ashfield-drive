"""/api/v1/workspaces/{id}/quota: 워크스페이스 quota 조회 (Workspace Admin) +
/api/v1/admin/workspaces/{id}/quota: 설정 (System Admin).

조회는 한도 + 현재 사용량 반환. 설정은 limit 만.
"""

from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import require_admin, require_workspace_admin
from app.core.db import get_db
from app.core.logging import logger
from app.models.workspace_quota import WorkspaceQuota
from app.services.audit import write_audit
from app.services.quotas import compute_usage, compute_version_usage

# Workspace Admin 조회용
view_router = APIRouter(prefix="/workspaces/{workspace_id}/quota", tags=["workspace"])
# System Admin 설정용
admin_router = APIRouter(prefix="/admin/workspaces/{workspace_id}/quota", tags=["admin"])


class QuotaResponse(BaseModel):
    workspace_id: str
    storage_bytes_limit: int | None  # None = 무제한
    storage_bytes_used: int  # 파일 + 버전 (ADR-0022)
    version_bytes_used: int = 0
    storage_pct: float | None  # None = 무제한, 0.0-1.0+ 비율


class QuotaPatch(BaseModel):
    storage_bytes_limit: int | None = Field(
        default=None,
        ge=0,
        description="None = 무제한. 0 = 새 업로드 전부 차단.",
    )


async def _build_response(
    db: AsyncSession, workspace_id: str
) -> QuotaResponse:
    q = await db.get(WorkspaceQuota, workspace_id)
    versions = await compute_version_usage(db, workspace_id=workspace_id)
    used = versions + await compute_usage(db, workspace_id=workspace_id)
    limit = q.storage_bytes_limit if q else None
    pct: float | None = None
    if limit is not None and limit > 0:
        pct = used / limit
    elif limit == 0:
        pct = 1.0 if used > 0 else 0.0
    return QuotaResponse(
        workspace_id=workspace_id,
        storage_bytes_limit=limit,
        storage_bytes_used=used,
        version_bytes_used=versions,
        storage_pct=pct,
    )


@view_router.get(
    "",
    response_model=QuotaResponse,
    summary="워크스페이스 quota 조회 (Workspace Admin)",
)
async def get_workspace_quota(
    workspace_id: str = Path(...),
    _: UserContext = Depends(require_workspace_admin),
    db: AsyncSession = Depends(get_db),
) -> QuotaResponse:
    return await _build_response(db, workspace_id)


@admin_router.get(
    "",
    response_model=QuotaResponse,
    summary="워크스페이스 quota 조회 (System Admin)",
)
async def admin_get_quota(
    workspace_id: str = Path(...),
    _: UserContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> QuotaResponse:
    return await _build_response(db, workspace_id)


@admin_router.put(
    "",
    response_model=QuotaResponse,
    summary="워크스페이스 quota 설정 (System Admin)",
)
async def admin_put_quota(
    body: QuotaPatch,
    workspace_id: str = Path(...),
    actor: UserContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> QuotaResponse:
    q = await db.get(WorkspaceQuota, workspace_id)
    is_new = q is None
    if q is None:
        q = WorkspaceQuota(workspace_id=workspace_id, storage_bytes_limit=body.storage_bytes_limit)
        db.add(q)
    else:
        q.storage_bytes_limit = body.storage_bytes_limit

    await write_audit(
        db,
        workspace_id=workspace_id,
        actor=actor,
        action="create" if is_new else "update",
        entity_type="workspace_quota",
        entity_id=workspace_id,
        meta={"storage_bytes_limit": body.storage_bytes_limit},
    )
    await db.commit()
    logger.info(
        "workspace_quota_updated",
        extra={
            "category": "biz",
            "workspace_id": workspace_id,
            "storage_bytes_limit": body.storage_bytes_limit,
            "actor": actor.sub,
        },
    )
    return await _build_response(db, workspace_id)
