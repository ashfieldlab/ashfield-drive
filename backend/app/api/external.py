"""/s/{token}: 인증 없이 접근하는 외부 공유 링크.

`api/v1` prefix 아님. JWT/X-Active-Workspace-Id 안 받음. 토큰 자체가 capability.

흐름:
  1. `GET /s/{token}` → 공개 메타. 없거나 철회면 404, 만료면 410(+ 공유한 사람 연락처).
     비밀번호 링크는 확인 전엔 항목 정보를 비운다.
  2. 비밀번호 링크는 `POST /s/{token}/meta` (body.password) 로 확인 + 항목 정보. 틀리면 401.
  3. 파일: `POST /s/{token}/download` → presigned URL 로 S3 직접 GET.
     폴더: `POST /s/{token}/list` (한 단계, 하위 폴더 탐색), `POST /s/{token}/zip` (모두 다운로드),
     `POST /s/{token}/download` + node_id (폴더 안 파일 하나).
  모든 POST 는 같은 비밀번호, 만료 검사. 보안 폴더(E2E) 항목은 링크로 열 수 없다 (403).

access_count, last_accessed_at 은 다운로드(파일, zip)마다 +1. 목록 조회는 세지 않는다.
"""

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.core.storage import presign_get
from app.models.external_link import ExternalLink
from app.models.node import Node
from app.schemas.external_link import (
    PublicAuthRequest,
    PublicCrumb,
    PublicDownloadRequest,
    PublicDownloadResponse,
    PublicFolderItem,
    PublicFolderListing,
    PublicFolderRequest,
    PublicNodeMeta,
)
from app.services.audit import record_file_access
from app.services.external_links import (
    breadcrumb,
    check_password,
    get_active_link_by_token,
    link_root,
    list_public_children,
    resolve_in_link,
    sharer_of,
    subtree_has_vault,
    touch_access,
)
from app.services.zip_export import build_folder_zip

router = APIRouter(prefix="/s", tags=["external"])

_ERRORS = {
    401: {"description": "password 없음/틀림"},
    404: {"description": "링크 없음, 철회, 노드 삭제, 링크 범위 밖"},
    410: {"description": "링크 만료: detail 에 sharer_name, sharer_email, expired_at"},
}


def _client_ip(request: Request) -> str | None:
    # IP 는 기록용일 뿐 보안 판단에 쓰지 않는다 (프록시가 붙인 X-Forwarded-For 우선).
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else None)


async def _meta(
    db: AsyncSession, link: ExternalLink, node: Node, *, reveal: bool
) -> PublicNodeMeta:
    name, email = await sharer_of(db, link)
    return PublicNodeMeta(
        node_id=node.id if reveal else None,
        name=node.name if reveal else None,
        kind=node.kind if reveal else None,
        size_bytes=node.size_bytes if reveal else None,
        mime=node.mime if reveal else None,
        permission=link.permission,
        requires_password=link.password_hash is not None,
        sharer_name=name,
        sharer_email=email,
        expires_at=link.expires_at,
    )


@router.get(
    "/{token}",
    response_model=PublicNodeMeta,
    summary="공개 링크 메타: 인증 불필요",
    responses={k: v for k, v in _ERRORS.items() if k != 401},
)
async def public_link_meta(
    token: str, db: AsyncSession = Depends(get_db)
) -> PublicNodeMeta:
    link = await get_active_link_by_token(db, token)
    node = await link_root(db, link)
    return await _meta(db, link, node, reveal=link.password_hash is None)


@router.post(
    "/{token}/meta",
    response_model=PublicNodeMeta,
    summary="비밀번호 확인 + 항목 메타",
    responses=_ERRORS,
)
async def public_link_meta_unlocked(
    token: str, body: PublicAuthRequest, db: AsyncSession = Depends(get_db)
) -> PublicNodeMeta:
    link = await get_active_link_by_token(db, token)
    check_password(link, body.password)
    node = await link_root(db, link)
    return await _meta(db, link, node, reveal=True)


@router.post(
    "/{token}/download",
    response_model=PublicDownloadResponse,
    summary="공개 링크로 presigned GET URL 발급",
    responses={
        **_ERRORS,
        403: {"description": "보안 폴더 항목"},
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
    check_password(link, body.password)
    node = await resolve_in_link(db, link, body.node_id)
    if node.kind != "file" or node.status != "ready" or node.storage_key is None:
        raise HTTPException(409, "Not a downloadable file")

    url = await presign_get(node.storage_key, download_name=node.name)
    await touch_access(db, link)
    await record_file_access(
        db,
        node,
        actor=None,
        actor_type="public",
        kind="link_access",
        meta={"link_id": link.id, "ip": _client_ip(request)},
    )
    await db.commit()
    return PublicDownloadResponse(
        url=url, expires_in=settings.presign_download_ttl_seconds
    )


@router.post(
    "/{token}/list",
    response_model=PublicFolderListing,
    summary="폴더 링크: 한 단계 목록 (하위 폴더는 folder_id 로 탐색)",
    responses={
        **_ERRORS,
        403: {"description": "보안 폴더 항목"},
        409: {"description": "폴더가 아님"},
    },
)
async def public_list(
    token: str, body: PublicFolderRequest, db: AsyncSession = Depends(get_db)
) -> PublicFolderListing:
    link = await get_active_link_by_token(db, token)
    check_password(link, body.password)
    folder = await resolve_in_link(db, link, body.folder_id)
    if folder.kind != "folder":
        raise HTTPException(409, "Not a folder")
    root = await link_root(db, link)
    path = await breadcrumb(db, root, folder)
    children = await list_public_children(db, folder)
    return PublicFolderListing(
        folder_id=folder.id,
        name=folder.name,
        path=[PublicCrumb(id=n.id, name=n.name) for n in path],
        items=[
            PublicFolderItem(
                id=n.id,
                name=n.name,
                kind=n.kind,
                size_bytes=n.size_bytes,
                mime=n.mime,
                updated_at=n.updated_at,
                available=ok,
            )
            for n, ok in children
        ],
    )


@router.post(
    "/{token}/zip",
    summary="폴더 링크: 모두 다운로드 (ZIP)",
    responses={
        200: {"content": {"application/zip": {}}, "description": "ZIP 본문"},
        **_ERRORS,
        403: {"description": "보안 폴더 항목, 또는 보안 폴더를 포함"},
        409: {"description": "폴더가 아님"},
        413: {"description": "용량 또는 파일 수 한도 초과"},
    },
)
async def public_zip(
    token: str,
    body: PublicFolderRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Response:
    link = await get_active_link_by_token(db, token)
    check_password(link, body.password)
    folder = await resolve_in_link(db, link, body.folder_id)
    if folder.kind != "folder":
        raise HTTPException(409, "Not a folder")
    # 보안 폴더 내용은 서버가 암호문만 갖고 있어 묶어 줄 수 없다: 포함하면 거절.
    if await subtree_has_vault(db, folder.id):
        raise HTTPException(403, "Folder contains a secure folder")

    data = await build_folder_zip(db, root=folder)
    await touch_access(db, link)
    await record_file_access(
        db,
        folder,
        actor=None,
        actor_type="public",
        kind="zip_download",
        meta={"link_id": link.id, "ip": _client_ip(request)},
    )
    await db.commit()
    # 헤더는 latin-1 만 허용: ASCII 대체 이름 + RFC 5987 UTF-8 이름 (한글 폴더명)
    ascii_name = "".join(c if c.isascii() and c.isalnum() else "_" for c in folder.name)[:40]
    utf8_name = quote(f"{folder.name}.zip", safe="")
    return Response(
        content=data,
        media_type="application/zip",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_name or "folder"}.zip"; '
                f"filename*=UTF-8''{utf8_name}"
            )
        },
    )
