"""/s/{token}: 인증 없이 접근하는 외부 공유 링크.

`api/v1` prefix 아님. JWT/X-Active-Workspace-Id 안 받음. 토큰 자체가 capability.

흐름:
  1. `GET /s/{token}` → 공개 메타 (이름·MIME·크기·has_password 등). 없거나 만료·철회면 404.
  2. has_password=true 면 `POST /s/{token}/download` 의 body 에 password 포함. 틀리면 401.
  3. 응답의 presigned URL 로 S3 직접 GET.

access_count, last_accessed_at 은 매 `/download` 호출마다 +1.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.core.storage import presign_get
from app.models.node import Node
from app.schemas.external_link import (
    PublicDownloadRequest,
    PublicDownloadResponse,
    PublicNodeMeta,
)
from app.services.audit import record_file_access
from app.services.external_links import (
    get_active_link_by_token,
    touch_access,
    verify_password,
)

router = APIRouter(prefix="/s", tags=["external"])


@router.get(
    "/{token}",
    response_model=PublicNodeMeta,
    summary="공개 링크 메타: 인증 불필요",
    responses={404: {"description": "링크 없음, 만료, 철회 또는 노드 삭제됨"}},
)
async def public_link_meta(
    token: str, db: AsyncSession = Depends(get_db)
) -> PublicNodeMeta:
    link = await get_active_link_by_token(db, token)
    node = await db.get(Node, link.node_id)
    if node is None or node.deleted_at is not None:
        raise HTTPException(404, "Link not found")
    return PublicNodeMeta(
        node_id=node.id,
        name=node.name,
        kind=node.kind,
        size_bytes=node.size_bytes,
        mime=node.mime,
        permission=link.permission,
        requires_password=link.password_hash is not None,
    )


@router.post(
    "/{token}/download",
    response_model=PublicDownloadResponse,
    summary="공개 링크로 presigned GET URL 발급",
    responses={
        401: {"description": "password 없음/틀림"},
        404: {"description": "링크 없음·만료·철회"},
        409: {"description": "파일이 아니거나 업로드 미완료"},
    },
)
async def public_download(
    token: str,
    body: PublicDownloadRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> PublicDownloadResponse:
    link = await get_active_link_by_token(db, token)

    if link.password_hash is not None:
        if not body.password or not verify_password(body.password, link.password_hash):
            raise HTTPException(401, "Invalid password")

    node = await db.get(Node, link.node_id)
    if node is None or node.deleted_at is not None:
        raise HTTPException(404, "Link not found")
    if node.kind != "file" or node.status != "ready" or node.storage_key is None:
        raise HTTPException(409, "Not a downloadable file")

    url = await presign_get(node.storage_key, download_name=node.name)
    await touch_access(db, link)
    # 열람 기록. IP 는 기록용일 뿐 보안 판단에 쓰지 않는다 (프록시가 붙인 X-Forwarded-For 우선).
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() or (request.client.host if request.client else None)
    await record_file_access(
        db,
        node,
        actor=None,
        actor_type="public",
        kind="link_access",
        meta={"link_id": link.id, "ip": ip},
    )
    await db.commit()
    return PublicDownloadResponse(
        url=url, expires_in=settings.presign_download_ttl_seconds
    )
