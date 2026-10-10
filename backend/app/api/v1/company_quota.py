"""/api/v1/companies/{id}/quota — 회사 quota 조회 (Company Admin) +
/api/v1/admin/companies/{id}/quota — 설정 (System Admin).

조회는 한도 + 현재 사용량 반환. 설정은 limit 만.
"""

from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import require_admin, require_company_admin
from app.core.db import get_db
from app.core.logging import logger
from app.models.company_quota import CompanyQuota
from app.services.audit import write_audit
from app.services.quotas import compute_usage, compute_version_usage

# Company Admin 조회용
view_router = APIRouter(prefix="/companies/{company_id}/quota", tags=["company"])
# System Admin 설정용
admin_router = APIRouter(prefix="/admin/companies/{company_id}/quota", tags=["admin"])


class QuotaResponse(BaseModel):
    company_id: str
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
    db: AsyncSession, company_id: str
) -> QuotaResponse:
    q = await db.get(CompanyQuota, company_id)
    versions = await compute_version_usage(db, company_id=company_id)
    used = versions + await compute_usage(db, company_id=company_id)
    limit = q.storage_bytes_limit if q else None
    pct: float | None = None
    if limit is not None and limit > 0:
        pct = used / limit
    elif limit == 0:
        pct = 1.0 if used > 0 else 0.0
    return QuotaResponse(
        company_id=company_id,
        storage_bytes_limit=limit,
        storage_bytes_used=used,
        version_bytes_used=versions,
        storage_pct=pct,
    )


@view_router.get(
    "",
    response_model=QuotaResponse,
    summary="회사 quota 조회 (Company Admin)",
)
async def get_company_quota(
    company_id: str = Path(...),
    _: UserContext = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
) -> QuotaResponse:
    return await _build_response(db, company_id)


@admin_router.get(
    "",
    response_model=QuotaResponse,
    summary="회사 quota 조회 (System Admin)",
)
async def admin_get_quota(
    company_id: str = Path(...),
    _: UserContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> QuotaResponse:
    return await _build_response(db, company_id)


@admin_router.put(
    "",
    response_model=QuotaResponse,
    summary="회사 quota 설정 (System Admin)",
)
async def admin_put_quota(
    body: QuotaPatch,
    company_id: str = Path(...),
    actor: UserContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> QuotaResponse:
    q = await db.get(CompanyQuota, company_id)
    is_new = q is None
    if q is None:
        q = CompanyQuota(company_id=company_id, storage_bytes_limit=body.storage_bytes_limit)
        db.add(q)
    else:
        q.storage_bytes_limit = body.storage_bytes_limit

    await write_audit(
        db,
        company_id=company_id,
        actor=actor,
        action="create" if is_new else "update",
        entity_type="company_quota",
        entity_id=company_id,
        meta={"storage_bytes_limit": body.storage_bytes_limit},
    )
    await db.commit()
    logger.info(
        "company_quota_updated",
        extra={
            "category": "biz",
            "company_id": company_id,
            "storage_bytes_limit": body.storage_bytes_limit,
            "actor": actor.sub,
        },
    )
    return await _build_response(db, company_id)
