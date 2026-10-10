"""/api/v1/search: 파일 검색.

이름 ILIKE 매치 후보를 effective_permission 으로 사후 필터(ADR-0020).
검색 가시성 = 열람 권한. 필터: kind·종류·수정일. FTS 는 보류(ILIKE).
"""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import get_current_user, require_active_workspace
from app.core.db import get_db
from app.models.node import Node
from app.schemas.node import NodeResponse
from app.services.nodes import effective_permission

# 종류(category) 필터: 프론트 files-list 와 동일 분류.
_IMAGE_EXTS = {
    "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff", "tif",
    "heic", "heif", "avif", "ico",
}
_DOC_EXTS = {
    "doc", "docx", "docm", "dot", "dotx", "dotm", "odt", "ott", "rtf", "txt",
    "html", "htm", "mht", "epub", "fb2", "xps", "oxps", "djvu", "hwp", "hwpx",
    "xls", "xlsx", "xlsm", "xlt", "xltx", "xltm", "ods", "ots", "csv",
    "ppt", "pptx", "pptm", "pot", "potx", "potm", "pps", "ppsx", "ppsm",
    "odp", "otp", "pdf",
}

FileCategory = Literal["image", "document", "other"]
NodeKindFilter = Literal["file", "folder"]

# 이름 매치 후보 상한: 권한 필터 후 limit 개 반환. 대부분 즉시 판정.
_CANDIDATE_CAP = 200


def _category_of(name: str) -> FileCategory:
    dot = name.rfind(".")
    ext = "" if dot < 0 else name[dot + 1 :].lower()
    if ext in _IMAGE_EXTS:
        return "image"
    if ext in _DOC_EXTS:
        return "document"
    return "other"


class SearchResponse(BaseModel):
    nodes: list[NodeResponse]


router = APIRouter(prefix="/search", tags=["search"])


@router.get(
    "",
    response_model=SearchResponse,
    summary="파일 검색 (권한 정합, ADR-0020)",
    responses={422: {"description": "q 가 비어있거나 128자 초과"}},
)
async def search(
    q: str = Query(..., min_length=1, max_length=128, description="검색어"),
    limit: int = Query(20, ge=1, le=100, description="결과 수"),
    kind: NodeKindFilter | None = Query(None, description="file | folder"),
    category: FileCategory | None = Query(
        None, description="image | document | other (파일만)"
    ),
    modified_from: datetime | None = Query(None, description="수정일 >= (파일)"),
    modified_to: datetime | None = Query(None, description="수정일 < (파일)"),
    user: UserContext = Depends(get_current_user),
    workspace_id: str = Depends(require_active_workspace),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    pattern = f"%{q}%"

    # 이름 매치 후보 → effective_permission 사후 필터 (ADR-0020)
    node_conds = [
        Node.workspace_id == workspace_id,
        Node.deleted_at.is_(None),
        Node.name.ilike(pattern),
    ]
    if kind:
        node_conds.append(Node.kind == kind)
    if modified_from:
        node_conds.append(Node.updated_at >= modified_from)
    if modified_to:
        node_conds.append(Node.updated_at < modified_to)

    node_stmt = (
        select(Node)
        .where(and_(*node_conds))
        .order_by(Node.kind.desc(), Node.name)
        .limit(_CANDIDATE_CAP)
    )
    candidates = list((await db.execute(node_stmt)).scalars().all())

    nodes: list[Node] = []
    for n in candidates:
        if category and n.kind == "file" and _category_of(n.name) != category:
            continue
        if category and n.kind == "folder":
            continue  # 종류 필터는 파일 전용
        perm = await effective_permission(
            db, n, user=user, workspace_id=workspace_id
        )
        if perm > 0:
            nodes.append(n)
        if len(nodes) >= limit:
            break

    return SearchResponse(
        nodes=[NodeResponse.model_validate(n, from_attributes=True) for n in nodes],
    )
