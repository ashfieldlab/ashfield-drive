"""/api/v1/nodes: 파일/폴더 트리.

권한 모델 (ADR-0008):
  - personal: owner 만 접근. FileShare 로 명시적 부여 가능.
  - shared: 같은 회사 멤버 모두 접근.
  - 폴더 share 는 자손에 자동 상속 (재귀 CTE).

업로드/다운로드 (ADR-0005):
  - 본문은 절대 백엔드 통과 안 함.
  - 작은 파일: presigned PUT(60s) → /complete.
  - 50MB+: multipart: /upload-url 응답에 upload_id, /parts/{n}/url 로 per-part PUT, /complete-multipart.
  - 다운로드: presigned GET(30s). 폴더 zip 만 백엔드가 합쳐서 반환.

다른 회사 리소스는 403 이 아니라 404 로 마스킹.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import get_current_user, require_active_company
from app.core.config import settings
from app.core.db import get_db
from app.core.logging import logger
from app.core.storage import (
    abort_multipart_upload,
    complete_multipart_upload,
    create_multipart_upload,
    head_object,
    presign_get,
    presign_put,
    presign_upload_part,
)
from app.models.audit_log import AuditLog
from app.models.external_link import ExternalLink
from app.models.file_share import FileShare
from app.models.node import Node
from app.models.user import User
from app.schemas.external_link import (
    ExternalLinkCreate,
    ExternalLinkList,
    ExternalLinkResponse,
)
from app.schemas.file_share import (
    FileShareCreate,
    FileShareList,
    FileShareResponse,
)
from app.schemas.node import (
    ChangesResponse,
    CompleteMultipartRequest,
    DownloadUrlResponse,
    FolderCreate,
    NodeChange,
    NodePatch,
    NodeResponse,
    OverwriteCompleteRequest,
    OverwriteUrlRequest,
    PartUrlResponse,
    TreeResponse,
    UploadUrlRequest,
    UploadUrlResponse,
)
from app.services import departments, file_versions
from app.services.audit import record_file_access, write_audit
from app.services.external_links import (
    hash_password,
    new_link_id,
    new_token,
)
from app.services.file_shares import (
    assert_can_manage_shares,
    get_share_or_404,
    list_shares_for_node,
    upsert_group_share,
    upsert_share,
)
from app.services.nodes import (
    assert_access,
    assert_no_parent_cycle,
    assert_parent_writable,
    collect_descendants,
    get_node_or_404,
    is_vault_content,
    list_ancestors,
    list_children,
    list_shared_with_me,
    list_subtree,
    list_trash,
    new_node_id,
    purge_subtree_storage,
    resolve_name_conflict,
    restore,
    soft_delete,
    storage_key_for,
    touch_etag,
)
from app.services.notifications import PendingDispatch, notify
from app.services.zip_export import build_folder_zip

router = APIRouter(prefix="/nodes", tags=["nodes"])


def _check_if_match(node: Node, if_match: str | None) -> None:
    """Sync 클라이언트 (desktop) 의 optimistic locking.

    클라이언트가 `If-Match: <etag>` 헤더 보내면 현재 server etag 와 비교.
    mismatch 면 412: 클라이언트가 변경된 server 본 후 충돌 사본 생성.
    헤더 미제공 시 검증 skip (기존 클라이언트 호환).
    """
    if if_match is None:
        return
    # RFC 7232: value 는 "<etag>" 같이 따옴표 가능. 양쪽 다 받기
    expected = if_match.strip().strip('"')
    current = node.etag or ""
    if expected != current:
        raise HTTPException(
            status_code=412,
            detail={
                "code": "ETAG_MISMATCH",
                "message": "노드가 다른 곳에서 이미 변경됨",
                "current_etag": current,
            },
        )


def _to_response(node: Node) -> NodeResponse:
    return NodeResponse.model_validate(node, from_attributes=True)


# ---------------------------------------------------------------------------
# 폴더 / 트리
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=NodeResponse,
    status_code=201,
    summary="폴더 생성",
    responses={
        400: {"description": "parent_id 가 폴더가 아니거나 scope 가 부모와 불일치"},
        403: {"description": "부모 폴더 write 권한 없음"},
        404: {"description": "parent_id 가 존재하지 않거나 다른 회사 (마스킹)"},
    },
)
async def create_folder(
    body: FolderCreate,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> NodeResponse:
    """루트 또는 다른 폴더 아래에 새 폴더 생성.

    - `parent_id=null` → 루트
    - 동일 폴더 동일 이름이 있으면 ` (2)`, ` (3)` 자동 부여
    - audit `create` row 생성
    """
    await assert_parent_writable(
        db,
        parent_id=body.parent_id,
        scope=body.scope,
        user=user,
        company_id=company_id,
    )
    name = await resolve_name_conflict(db, parent_id=body.parent_id, name=body.name)
    node = Node(
        id=new_node_id(),
        kind="folder",
        name=name,
        parent_id=body.parent_id,
        company_id=company_id,
        owner_id=user.sub,
        scope=body.scope,
        status="ready",
    )
    db.add(node)
    await write_audit(
        db,
        company_id=company_id,
        actor=user,
        action="create",
        entity_type="node",
        entity_id=node.id,
        meta={"kind": "folder", "name": node.name, "scope": node.scope},
    )
    await db.commit()
    await db.refresh(node)
    logger.info(
        "node_created",
        extra={"category": "api", "node_id": node.id, "kind": "folder"},
    )
    return _to_response(node)


@router.get(
    "/tree",
    response_model=TreeResponse,
    summary="자식 노드 목록",
    responses={
        403: {"description": "parent_id 의 부모 폴더 read 권한 없음"},
        404: {"description": "parent_id 존재하지 않음"},
    },
)
async def get_tree(
    parent_id: str | None = Query(None, description="None=루트, 지정 시 그 폴더의 자식"),
    scope: str = Query(
        "personal",
        pattern="^(personal|shared)$",
        description="루트(`parent_id=null`)에서만 의미. 폴더 안에서는 부모의 scope 상속.",
    ),
    recursive: bool = Query(
        False,
        description="True 면 scope 전체 서브트리(모든 깊이) 평탄 반환: desktop sync 용. parent_id 무시.",
    ),
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> TreeResponse:
    """폴더 한 단계 자식만 반환 (웹). recursive=true 면 전체 서브트리 (desktop sync).

    루트 + scope=personal 은 본인 소유 노드만. shared 는 회사 멤버 전부 동일 결과.
    공유받은 외부 노드는 `/shared-with-me` 에서.
    """
    if recursive:
        nodes = await list_subtree(
            db, company_id=company_id, user=user, scope=scope  # type: ignore[arg-type]
        )
    else:
        nodes = await list_children(
            db,
            company_id=company_id,
            user=user,
            parent_id=parent_id,
            scope=scope,  # type: ignore[arg-type]
        )
    return TreeResponse(nodes=[_to_response(n) for n in nodes])


@router.get(
    "/trash",
    response_model=TreeResponse,
    summary="휴지통 목록",
)
async def get_trash(
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> TreeResponse:
    """본인 personal soft-deleted + 회사 shared soft-deleted 를 한 번에.

    Phase 3 후속: N일 이상 묵으면 자동 청소. 지금은 영구.
    """
    nodes = await list_trash(db, company_id=company_id, user=user)
    return TreeResponse(nodes=[_to_response(n) for n in nodes])


class TrashEmptyResponse(BaseModel):
    purged: int


@router.delete(
    "/trash",
    response_model=TrashEmptyResponse,
    summary="휴지통 비우기: soft-deleted 노드 전체 영구 삭제",
    responses={200: {"description": "삭제된 노드 수"}},
)
async def empty_trash(
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> TrashEmptyResponse:
    """본인 personal soft-deleted + 회사 shared soft-deleted 노드를 hard delete + S3 object 제거.

    부모만 휴지통에 들어간 폴더의 자손 파일들도 RECURSIVE CTE 로 펼쳐 S3 object 까지 제거.
    DB row 는 FK ondelete=CASCADE 로 부모 hard-delete 시 자동 정리.

    회사 공유 폴더/파일도 누구든 비울 수 있다 (휴지통은 회사 단위 공통).
    """
    nodes = await list_trash(db, company_id=company_id, user=user)
    if not nodes:
        return TrashEmptyResponse(purged=0)

    # 자손 file S3 객체 정리(공용 seam) → row 는 top 노드 delete 시 CASCADE.
    storage_deleted = await purge_subtree_storage(db, [n.id for n in nodes])
    for n in nodes:
        await db.delete(n)

    await write_audit(
        db,
        company_id=company_id,
        actor=user,
        action="empty_trash",
        entity_type="node",
        entity_id="*",
        meta={"purged": len(nodes), "storage_objects_deleted": storage_deleted},
    )
    await db.commit()
    return TrashEmptyResponse(purged=len(nodes))


@router.get(
    "/shared-with-me",
    response_model=TreeResponse,
    summary="공유받은 노드 목록",
)
async def get_shared_with_me(
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> TreeResponse:
    """본인이 직접 grantee 인 `FileShare` 의 노드 (ancestor 상속은 제외: 거기엔 자손이 함께 노출되므로 중복).

    expired share 는 제외.
    """
    nodes = await list_shared_with_me(db, company_id=company_id, user=user)
    return TreeResponse(nodes=[_to_response(n) for n in nodes])


@router.get(
    "/changes",
    response_model=ChangesResponse,
    summary="Desktop sync: delta polling. since 이후 변경분.",
    responses={
        400: {"description": "since 파라미터 형식 오류"},
    },
)
async def get_changes(
    since: datetime,
    limit: int = Query(default=500, ge=1, le=2000),
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> ChangesResponse:
    """Desktop sync 클라이언트 의 delta polling endpoint (ADR-0015).

    `audit_logs` 의 entity_type='node' 변경을 since 이후로 가져옴.
    권한 layer: scope=shared (회사 멤버 모두) / scope=personal owner / FileShare direct grantee.
    Ancestor share 상속은 Phase 4 (지금은 direct share 만).

    limit 초과 시 has_more=true: 클라이언트가 마지막 occurred_at 으로 다시 호출.
    """
    # audit + node JOIN. node 가 hard-delete 됐어도 audit row 만 남으면 그건 반환 (node=None)
    stmt = (
        select(AuditLog, Node)
        .outerjoin(Node, Node.id == AuditLog.entity_id)
        .outerjoin(
            FileShare,
            (FileShare.node_id == Node.id) & (FileShare.grantee_sub == user.sub),
        )
        .where(
            AuditLog.company_id == company_id,
            AuditLog.entity_type == "node",
            AuditLog.created_at > since,
            # node 권한: node 가 살아있을 때만 의미. hard-delete 면 audit 만 (어차피
            # 삭제 알림이라 모든 사용자에 일관)
            (
                (Node.id.is_(None))  # hard-delete: audit 만 남음, 모든 user 노출
                | (Node.scope == "shared")
                | ((Node.scope == "personal") & (Node.owner_id == user.sub))
                | (FileShare.id.is_not(None))
            ),
        )
        .order_by(AuditLog.created_at)
        .limit(limit + 1)  # has_more 판정 위해 1 더
    )
    rows = (await db.execute(stmt)).all()

    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    changes: list[NodeChange] = []
    for audit, node in rows:
        changes.append(
            NodeChange(
                occurred_at=audit.created_at,
                action=audit.action,
                node_id=audit.entity_id,
                node=_to_response(node) if node is not None else None,
            )
        )

    return ChangesResponse(
        changes=changes,
        server_time=datetime.now(UTC),
        has_more=has_more,
    )


@router.get(
    "/events",
    summary="Desktop sync: SSE nudge. 변경 발생 시 즉시 신호 (delta 는 /changes 로).",
)
async def node_events(
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
) -> StreamingResponse:
    """활성 회사의 node 변경을 Redis pub/sub 로 받아 SSE 로 push.

    payload 없이 'change' 신호만: 클라이언트가 신호 받으면 `/changes?since=` 로
    실제 delta 를 가져온다. polling 의 실시간 대체 (polling 은 fallback 으로 유지).
    25초 heartbeat 로 idle 연결 유지. nginx 버퍼링은 X-Accel-Buffering 로 해제.
    """
    from app.core.redis import get_redis

    async def stream():
        redis = get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(f"node_events:{company_id}")
        try:
            yield ": connected\n\n"
            while True:
                msg = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=25.0
                )
                if msg is not None:
                    yield "data: change\n\n"
                else:
                    yield ": ping\n\n"  # heartbeat: 연결 유지
        finally:
            try:
                await pubsub.unsubscribe(f"node_events:{company_id}")
                await pubsub.aclose()
            except Exception:
                pass

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # nginx 버퍼링 해제 (SSE 즉시 전달)
        },
    )


class AncestorItem(BaseModel):
    id: str
    name: str
    kind: str


class AncestorsResponse(BaseModel):
    ancestors: list[AncestorItem]


@router.get(
    "/{node_id}/ancestors",
    response_model=AncestorsResponse,
    summary="조상 체인: root 부터 leaf 까지 순서",
    responses={404: {"description": "노드 없음 또는 다른 회사"}},
)
async def get_ancestors(
    node_id: str,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> AncestorsResponse:
    """브레드크럼용. leaf 자신 포함, root → leaf 순서."""
    rows = await list_ancestors(
        db, leaf_id=node_id, company_id=company_id, user=user
    )
    return AncestorsResponse(
        ancestors=[AncestorItem(**r) for r in rows]
    )


@router.get(
    "/{node_id}",
    response_model=NodeResponse,
    summary="노드 메타 조회",
    responses={
        404: {"description": "다른 회사 또는 권한 없는 personal (마스킹)"},
        403: {"description": "shared/share 권한 있으나 deleted 등"},
    },
)
async def get_node(
    node_id: str,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> NodeResponse:
    """단건 메타 조회. 본문은 별도 `/download-url` 로."""
    node = await get_node_or_404(db, node_id)
    await assert_access(db, node, user=user, company_id=company_id, permission="read")
    return _to_response(node)


@router.patch(
    "/{node_id}",
    response_model=NodeResponse,
    summary="이름 변경 / 이동",
    responses={
        400: {"description": "폴더를 자기 자신/자손 아래로 이동 시도, scope 불일치, 부모가 폴더 아님"},
        403: {"description": "write 권한 없음"},
        404: {"description": "노드 없음 또는 마스킹"},
    },
)
async def patch_node(
    node_id: str,
    body: NodePatch,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
    if_match: str | None = Header(default=None, alias="If-Match"),
) -> NodeResponse:
    """필드만 보낸 것만 변경. parent_id 변경 시 사이클·scope 일관 검사.

    Desktop sync 클라이언트가 If-Match 헤더 보내면 etag 비교: mismatch 시 412.
    """
    node = await get_node_or_404(db, node_id)
    await assert_access(db, node, user=user, company_id=company_id, permission="write")
    _check_if_match(node, if_match)

    fields = body.model_dump(exclude_unset=True)
    new_parent_id = fields.get("parent_id", node.parent_id)
    new_name = fields.get("name", node.name)
    changed = False
    old_name = node.name
    old_parent_id = node.parent_id

    if "parent_id" in fields and new_parent_id != node.parent_id:
        await assert_parent_writable(
            db,
            parent_id=new_parent_id,
            scope=node.scope,
            user=user,
            company_id=company_id,
        )
        if node.kind == "folder" and new_parent_id is not None:
            await assert_no_parent_cycle(
                db, moving_id=node.id, new_parent_id=new_parent_id
            )
        node.parent_id = new_parent_id
        changed = True

    if "name" in fields and new_name != node.name:
        node.name = await resolve_name_conflict(
            db, parent_id=node.parent_id, name=new_name
        )
        changed = True

    # Sync 클라이언트 (desktop) 의 If-Match / delta polling 위해 변경 시 etag 갱신 + audit.
    # file content 변경은 별도 흐름 (complete endpoint 에서 S3 ETag) 이라 여기선 metadata 만.
    if changed:
        touch_etag(node)
        await write_audit(
            db,
            company_id=company_id,
            actor=user,
            action="update",
            entity_type="node",
            entity_id=node.id,
            meta={
                "kind": node.kind,
                "old_name": old_name,
                "new_name": node.name,
                "old_parent_id": old_parent_id,
                "new_parent_id": node.parent_id,
            },
        )

    await db.commit()
    await db.refresh(node)
    return _to_response(node)


async def _hard_delete_vault_node(
    db: AsyncSession,
    node: Node,
    *,
    user: UserContext,
    company_id: str,
) -> None:
    """vault 노드 즉시 영구 삭제: 자손 file 의 S3 객체 제거 + 노드 row 삭제(CASCADE).
    휴지통을 거치지 않음 (보안 폴더 정책)."""
    storage_deleted = await purge_subtree_storage(db, [node.id])
    if node.multipart_upload_id and node.storage_key:
        try:
            await abort_multipart_upload(
                node.storage_key, upload_id=node.multipart_upload_id
            )
        except Exception:
            pass
    await db.delete(node)  # 자손 row 는 FK ondelete=CASCADE 로 자동 정리
    await write_audit(
        db,
        company_id=company_id,
        actor=user,
        action="delete",
        entity_type="node",
        entity_id=node.id,
        meta={"kind": node.kind, "name": node.name, "vault": True, "permanent": True},
    )
    await db.commit()
    logger.info(
        "vault_node_hard_deleted",
        extra={"category": "api", "node_id": node.id, "storage_objects": storage_deleted},
    )


@router.delete(
    "/{node_id}",
    status_code=204,
    summary="휴지통 이동 (soft delete) · 보안 폴더는 즉시 영구 삭제",
    responses={
        403: {"description": "write 권한 없음"},
        404: {"description": "노드 없음 또는 마스킹"},
    },
)
async def delete_node(
    node_id: str,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
    if_match: str | None = Header(default=None, alias="If-Match"),
) -> None:
    """soft delete: `deleted_at = now()`. S3 객체는 그대로 남고 휴지통에서 보임.

    진행 중 multipart 업로드는 S3 abort 시도 후 계속.
    Desktop sync 의 If-Match 헤더 검증.
    """
    node = await get_node_or_404(db, node_id)
    await assert_access(db, node, user=user, company_id=company_id, permission="write")
    _check_if_match(node, if_match)
    if node.deleted_at is not None:
        return

    # 보안 폴더(vault) 내용은 휴지통을 거치지 않고 즉시 영구 삭제 (ADR-0016).
    # 공유 휴지통에 암호문 이름으로 새는 경계 침해 방지 + "보안 삭제" 의미.
    if await is_vault_content(db, node.id):
        await _hard_delete_vault_node(db, node, user=user, company_id=company_id)
        return

    # 진행 중 multipart 가 있으면 S3 측 abort (실패해도 soft-delete 는 계속)
    if node.multipart_upload_id and node.storage_key:
        try:
            await abort_multipart_upload(
                node.storage_key, upload_id=node.multipart_upload_id
            )
        except Exception as exc:
            logger.warning(
                "multipart_abort_failed",
                extra={"category": "storage", "node_id": node.id, "error": str(exc)},
            )
        node.multipart_upload_id = None
    soft_delete(node)
    # 폴더면 자손까지 cascade soft-delete: 안 하면 고아로 남아 desktop recursive
    # sync 에 떠다니고 휴지통/트리 정합성 깨짐.
    descendant_count = 0
    if node.kind == "folder":
        for desc in await collect_descendants(
            db, company_id=company_id, root_id=node.id
        ):
            soft_delete(desc)
            descendant_count += 1
    await write_audit(
        db,
        company_id=company_id,
        actor=user,
        action="delete",
        entity_type="node",
        entity_id=node.id,
        meta={"kind": node.kind, "name": node.name, "descendants": descendant_count},
    )
    await db.commit()
    logger.info(
        "node_soft_deleted",
        extra={"category": "api", "node_id": node.id, "descendants": descendant_count},
    )


@router.post(
    "/{node_id}/restore",
    response_model=NodeResponse,
    summary="휴지통에서 복원",
    responses={
        403: {"description": "personal 노드 owner 아님"},
        404: {"description": "노드 없음"},
    },
)
async def restore_node(
    node_id: str,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> NodeResponse:
    """이미 active 인 노드면 그대로 반환 (멱등). 동명 충돌 시 자동 rename."""
    node = await get_node_or_404(db, node_id)
    if node.company_id != company_id:
        raise HTTPException(404, "Node not found")
    if node.scope == "personal" and node.owner_id != user.sub:
        raise HTTPException(403, "Forbidden")
    if node.deleted_at is None:
        return _to_response(node)
    # 복원 시 동명 충돌 처리
    node.name = await resolve_name_conflict(db, parent_id=node.parent_id, name=node.name)
    restore(node)
    await write_audit(
        db,
        company_id=company_id,
        actor=user,
        action="restore",
        entity_type="node",
        entity_id=node.id,
        meta={"kind": node.kind, "name": node.name},
    )
    await db.commit()
    await db.refresh(node)
    return _to_response(node)


# ---------------------------------------------------------------------------
# 파일: 업로드/다운로드 presigned URL
# ---------------------------------------------------------------------------


@router.post(
    "/upload-url",
    response_model=UploadUrlResponse,
    summary="업로드 시작: presigned URL 발급",
    responses={
        400: {"description": "부모 폴더 검증 실패"},
        403: {"description": "부모 폴더 write 권한 없음"},
        404: {"description": "parent_id 없음"},
    },
)
async def create_upload_url(
    body: UploadUrlRequest,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> UploadUrlResponse:
    """`size` 가 50MB(`multipart_threshold_bytes`) 이상이면 multipart 흐름으로 분기.

    응답 분기:
      - 단일 PUT: `upload_url` 에 직접 PUT → `/complete`
      - multipart=true: `upload_id`, `part_size` 사용 →
        `POST /{id}/parts/{n}/url` 로 part 별 URL → `/complete-multipart` 에 ETag 리스트

    NodeRow 는 status=pending 으로 즉시 생성. /complete 호출까지는 휴지통/트리에 노출 X.
    """
    await assert_parent_writable(
        db,
        parent_id=body.parent_id,
        scope=body.scope,
        user=user,
        company_id=company_id,
    )
    # 회사 + 업로더 개인 스토리지 quota 검증: 초과 시 413 (D-3).
    from app.services.quotas import ensure_capacity, ensure_user_capacity

    await ensure_capacity(
        db, company_id=company_id, additional_bytes=body.size
    )
    await ensure_user_capacity(
        db, company_id=company_id, user_sub=user.sub, additional_bytes=body.size
    )
    name = await resolve_name_conflict(db, parent_id=body.parent_id, name=body.name)
    node_id = new_node_id()
    storage_key = storage_key_for(company_id, node_id)

    is_multipart = body.size >= settings.multipart_threshold_bytes
    upload_id: str | None = None
    if is_multipart:
        upload_id = await create_multipart_upload(storage_key, content_type=body.mime)

    node = Node(
        id=node_id,
        kind="file",
        name=name,
        parent_id=body.parent_id,
        company_id=company_id,
        owner_id=user.sub,
        scope=body.scope,
        storage_key=storage_key,
        size_bytes=body.size,
        mime=body.mime,
        status="pending",
        multipart_upload_id=upload_id,
        wrapped_dek=body.wrapped_dek,  # E2E vault 파일이면 설정, 아니면 None
    )
    db.add(node)
    await db.commit()

    if is_multipart:
        return UploadUrlResponse(
            node_id=node_id,
            multipart=True,
            upload_id=upload_id,
            part_size=settings.multipart_part_size_bytes,
            expires_in=settings.presign_upload_ttl_seconds,
        )

    url = await presign_put(storage_key, content_type=body.mime)
    return UploadUrlResponse(
        node_id=node_id,
        upload_url=url,
        expires_in=settings.presign_upload_ttl_seconds,
    )


@router.post(
    "/{node_id}/parts/{part_number}/url",
    response_model=PartUrlResponse,
    summary="Multipart: 파트별 presigned URL",
    responses={
        400: {"description": "part_number 가 1~10000 범위 밖"},
        409: {"description": "multipart 진행 중 노드가 아님 (이미 완료 또는 단일 PUT)"},
    },
)
async def get_part_url(
    node_id: str,
    part_number: int,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> PartUrlResponse:
    """클라이언트가 파일을 part_size 단위로 잘라 PUT 한 후 응답 헤더의 ETag 를 수집.

    최초 업로드 (status=pending, storage_key 대상) 와 내용 교체
    (status=ready + pending_storage_key 대상) 둘 다 지원.
    """
    node = await get_node_or_404(db, node_id)
    await assert_access(db, node, user=user, company_id=company_id, permission="write")
    target_key = node.pending_storage_key or (
        node.storage_key if node.status == "pending" else None
    )
    if node.kind != "file" or not node.multipart_upload_id or not target_key:
        raise HTTPException(409, "Not a multipart upload in progress")
    if part_number < 1 or part_number > 10000:
        raise HTTPException(400, "Invalid part number")
    url = await presign_upload_part(
        target_key,
        upload_id=node.multipart_upload_id,
        part_number=part_number,
    )
    return PartUrlResponse(
        url=url, expires_in=settings.presign_upload_ttl_seconds
    )


@router.post(
    "/{node_id}/complete-multipart",
    response_model=NodeResponse,
    summary="Multipart: 완료: CompleteMultipartUpload",
    responses={
        400: {"description": "parts 비어있음 또는 S3 complete 실패 (abort 후 보고)"},
        409: {"description": "multipart 진행 중 노드가 아님"},
    },
)
async def complete_multipart(
    node_id: str,
    body: CompleteMultipartRequest,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> NodeResponse:
    """parts = [{PartNumber, ETag}, ...]: 모든 파트 PUT 후 호출.

    실패 시 S3 측 multipart abort 시도 후 400. status → ready 로 전이 + audit row.
    """
    node = await get_node_or_404(db, node_id)
    await assert_access(db, node, user=user, company_id=company_id, permission="write")
    if (
        node.kind != "file"
        or node.status != "pending"
        or not node.multipart_upload_id
        or not node.storage_key
    ):
        raise HTTPException(409, "Not a multipart upload in progress")
    if not body.parts:
        raise HTTPException(400, "Empty parts list")

    try:
        result = await complete_multipart_upload(
            node.storage_key,
            upload_id=node.multipart_upload_id,
            parts=body.parts,
        )
    except Exception as exc:
        # 실패 시 abort 시도 후 그대로 보고
        try:
            await abort_multipart_upload(
                node.storage_key, upload_id=node.multipart_upload_id
            )
        finally:
            node.multipart_upload_id = None
            await db.commit()
        raise HTTPException(400, f"Multipart complete failed: {exc}") from exc

    node.etag = (result.get("ETag") or "").strip('"') or None
    meta = await head_object(node.storage_key)
    if meta is not None:
        node.size_bytes = int(meta.get("ContentLength", node.size_bytes or 0))
    node.status = "ready"
    node.multipart_upload_id = None
    file_versions.mark_content(node, saved_by=user.sub, saved_at=datetime.now(UTC))
    await write_audit(
        db,
        company_id=company_id,
        actor=user,
        action="create",
        entity_type="node",
        entity_id=node.id,
        meta={
            "kind": "file",
            "name": node.name,
            "size": node.size_bytes,
            "multipart": True,
        },
    )
    stale_keys = await file_versions.reclaim_space(db, node, actor=user)
    await db.commit()
    await db.refresh(node)
    await file_versions.delete_objects(stale_keys)
    return _to_response(node)


@router.post(
    "/{node_id}/complete",
    response_model=NodeResponse,
    summary="단일 PUT 완료: head_object 로 확인 후 ready 전이",
    responses={
        400: {"description": "S3 에 객체가 아직 없음 (PUT 미완료)"},
        409: {"description": "multipart 노드: `/complete-multipart` 사용해야 함"},
    },
)
async def complete_upload(
    node_id: str,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> NodeResponse:
    node = await get_node_or_404(db, node_id)
    await assert_access(db, node, user=user, company_id=company_id, permission="write")
    if node.kind != "file":
        raise HTTPException(400, "Not a file")
    if node.status == "ready":
        return _to_response(node)
    if node.storage_key is None:
        raise HTTPException(500, "Node missing storage_key")

    meta = await head_object(node.storage_key)
    if meta is None:
        raise HTTPException(400, "Upload not found in storage")

    node.size_bytes = int(meta.get("ContentLength", node.size_bytes or 0))
    node.etag = (meta.get("ETag") or "").strip('"') or None
    node.status = "ready"
    file_versions.mark_content(node, saved_by=user.sub, saved_at=datetime.now(UTC))
    await write_audit(
        db,
        company_id=company_id,
        actor=user,
        action="create",
        entity_type="node",
        entity_id=node.id,
        meta={"kind": "file", "name": node.name, "size": node.size_bytes},
    )
    stale_keys = await file_versions.reclaim_space(db, node, actor=user)
    await db.commit()
    await db.refresh(node)
    await file_versions.delete_objects(stale_keys)
    logger.info(
        "node_upload_completed",
        extra={"category": "api", "node_id": node.id, "size": node.size_bytes},
    )
    return _to_response(node)


@router.post(
    "/{node_id}/overwrite-url",
    response_model=UploadUrlResponse,
    summary="내용 교체 시작: 기존 file 노드에 새 내용 presigned URL",
    responses={
        400: {"description": "폴더이거나 업로드 미완료(pending) 노드"},
        403: {"description": "write 권한 없음"},
        404: {"description": "노드 없음 또는 삭제됨"},
        412: {"description": "If-Match 의 etag 가 현재와 불일치 (동시 수정 충돌)"},
        413: {"description": "회사 스토리지 quota 초과"},
    },
)
async def create_overwrite_url(
    node_id: str,
    body: OverwriteUrlRequest,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
    if_match: str | None = Header(default=None, alias="If-Match"),
) -> UploadUrlResponse:
    """Desktop sync (ADR-0015) 의 수정 업로드 경로.

    write-to-new-key + swap: 새 내용은 별도 S3 key (`pending_storage_key`) 로
    올라가고 `/overwrite-complete` 에서 승격. 업로드 실패가 현재 내용을 깨뜨리지
    않음. If-Match 로 optimistic locking: 412 면 클라이언트가 충돌 사본 생성.

    이미 진행 중인 교체가 있으면 새 교체가 그것을 대체 (옛 pending key 는 고아.
    cron 정리 대상, 기능 영향 없음).
    """
    node = await get_node_or_404(db, node_id)
    await assert_access(db, node, user=user, company_id=company_id, permission="write")
    if node.kind != "file":
        raise HTTPException(400, "Not a file")
    if node.deleted_at is not None:
        raise HTTPException(404, "Node not found")
    if node.status != "ready":
        raise HTTPException(400, "Initial upload not completed")
    _check_if_match(node, if_match)

    from app.services.quotas import ensure_capacity, ensure_user_capacity

    _delta = max(0, body.size - (node.size_bytes or 0))
    await ensure_capacity(
        db, company_id=company_id, additional_bytes=_delta
    )
    # 파일 소유자(업로더 아님) 개인 한도 기준: 사용량은 소유자에게 귀속.
    await ensure_user_capacity(
        db,
        company_id=company_id,
        user_sub=node.owner_id,
        additional_bytes=_delta,
    )

    pending_key = f"{storage_key_for(company_id, node.id)}.{new_node_id()}"
    is_multipart = body.size >= settings.multipart_threshold_bytes
    if is_multipart:
        node.multipart_upload_id = await create_multipart_upload(
            pending_key, content_type=body.mime
        )
    else:
        node.multipart_upload_id = None
    node.pending_storage_key = pending_key
    node.pending_wrapped_dek = body.wrapped_dek  # 완료 시 wrapped_dek 로 승격
    await db.commit()

    if is_multipart:
        return UploadUrlResponse(
            node_id=node.id,
            multipart=True,
            upload_id=node.multipart_upload_id,
            part_size=settings.multipart_part_size_bytes,
            expires_in=settings.presign_upload_ttl_seconds,
        )
    url = await presign_put(pending_key, content_type=body.mime)
    return UploadUrlResponse(
        node_id=node.id,
        upload_url=url,
        expires_in=settings.presign_upload_ttl_seconds,
    )


@router.post(
    "/{node_id}/overwrite-complete",
    response_model=NodeResponse,
    summary="내용 교체 완료: 새 key 승격, 옛 내용은 버전으로 (ADR-0022)",
    responses={
        400: {"description": "S3 에 새 객체 없음, 또는 multipart parts 문제"},
        409: {"description": "진행 중인 교체 없음"},
    },
)
async def complete_overwrite(
    node_id: str,
    body: OverwriteCompleteRequest,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> NodeResponse:
    """단일 PUT 은 body 없이, multipart 는 parts 리스트와 함께 호출."""
    node = await get_node_or_404(db, node_id)
    await assert_access(db, node, user=user, company_id=company_id, permission="write")
    pending_key = node.pending_storage_key
    if node.kind != "file" or not pending_key:
        raise HTTPException(409, "No overwrite in progress")

    if node.multipart_upload_id:
        if not body.parts:
            raise HTTPException(400, "Empty parts list")
        try:
            await complete_multipart_upload(
                pending_key,
                upload_id=node.multipart_upload_id,
                parts=body.parts,
            )
        except Exception as exc:
            try:
                await abort_multipart_upload(
                    pending_key, upload_id=node.multipart_upload_id
                )
            finally:
                node.multipart_upload_id = None
                node.pending_storage_key = None
                await db.commit()
            raise HTTPException(400, f"Multipart complete failed: {exc}") from exc

    meta = await head_object(pending_key)
    if meta is None:
        raise HTTPException(400, "Upload not found in storage")

    # 밀려나는 내용을 버전으로 남긴다 (ADR-0022). 묶기 대상이면 버려질 key 가 돌아온다.
    now = datetime.now(UTC)
    stale_keys = await file_versions.retire_current(db, node, actor=user, now=now)
    node.storage_key = pending_key
    node.pending_storage_key = None
    node.multipart_upload_id = None
    # E2E: 새 내용의 wrapped DEK 승격 (pending 이 있을 때만: 일반 파일은 None 유지)
    if node.pending_wrapped_dek is not None:
        node.wrapped_dek = node.pending_wrapped_dek
        node.pending_wrapped_dek = None
    node.size_bytes = int(meta.get("ContentLength", node.size_bytes or 0))
    node.etag = (meta.get("ETag") or "").strip('"') or None
    file_versions.mark_content(node, saved_by=user.sub, saved_at=now)
    await write_audit(
        db,
        company_id=company_id,
        actor=user,
        action="update",
        entity_type="node",
        entity_id=node.id,
        meta={"kind": "file", "name": node.name, "size": node.size_bytes, "overwrite": True},
    )
    stale_keys += await file_versions.reclaim_space(db, node, actor=user)
    await db.commit()
    await db.refresh(node)
    # 묶기로 버려진 옛 내용·한도 정리분 삭제: 실패해도 교체는 성공 (고아 객체만 남음)
    await file_versions.delete_objects(stale_keys)

    logger.info(
        "node_overwrite_completed",
        extra={"category": "api", "node_id": node.id, "size": node.size_bytes},
    )
    return _to_response(node)


@router.post(
    "/{node_id}/download-url",
    response_model=DownloadUrlResponse,
    summary="파일 단건 presigned GET URL",
    responses={
        400: {"description": "폴더는 `/zip` 사용"},
        409: {"description": "업로드 미완료(pending)"},
    },
)
async def create_download_url(
    node_id: str,
    purpose: str = Query(
        "download",
        description="download = attachment, preview = inline (짧은 TTL).",
        pattern="^(download|preview)$",
    ),
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> DownloadUrlResponse:
    node = await get_node_or_404(db, node_id)
    await assert_access(db, node, user=user, company_id=company_id, permission="read")
    if node.deleted_at is not None:
        raise HTTPException(404, "Node not found")
    if node.kind != "file":
        raise HTTPException(400, "Not a file")
    if node.status != "ready" or node.storage_key is None:
        raise HTTPException(409, "File not ready")

    inline = purpose == "preview"
    url = await presign_get(node.storage_key, download_name=node.name, inline=inline)
    await record_file_access(db, node, actor=user, kind="preview" if inline else "download")
    return DownloadUrlResponse(
        url=url,
        expires_in=(
            settings.presign_preview_ttl_seconds
            if inline
            else settings.presign_download_ttl_seconds
        ),
    )


@router.get(
    "/{node_id}/zip",
    summary="폴더 zip 다운로드",
    responses={
        200: {
            "content": {"application/zip": {}},
            "description": "ZIP 본문. Content-Disposition 헤더로 다운로드 유도.",
        },
        400: {"description": "파일 노드: `/download-url` 사용"},
        413: {"description": "200MB 또는 500 files 한도 초과"},
    },
)
async def download_folder_zip(
    node_id: str,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """폴더 + 자손 파일 트리를 zip 으로 묶어 다운로드.

    cap: settings.zip_max_total_bytes / zip_max_files. pending 파일은 skip.
    """
    node = await get_node_or_404(db, node_id)
    await assert_access(db, node, user=user, company_id=company_id, permission="read")
    await record_file_access(db, node, actor=user, kind="zip_download")
    if node.kind != "folder":
        raise HTTPException(400, "Not a folder")

    body = await build_folder_zip(db, root=node)
    safe = "".join(c if c.isalnum() else "_" for c in node.name)[:40] or "folder"
    return Response(
        content=body,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe}.zip"'},
    )


# ---------------------------------------------------------------------------
# 파일 공유 (FileShare)
# ---------------------------------------------------------------------------


def _share_to_response(share, user_row, group_name=None) -> FileShareResponse:
    return FileShareResponse(
        id=share.id,
        node_id=share.node_id,
        grantee_sub=share.grantee_sub,
        grantee_email=user_row.email if user_row else None,
        grantee_name=user_row.name if user_row else None,
        grantee_group_id=share.grantee_group_id,
        group_name=group_name,
        permission=share.permission,
        granted_by_sub=share.granted_by_sub,
        granted_at=share.granted_at,
        expires_at=share.expires_at,
    )


@router.get(
    "/{node_id}/shares",
    response_model=FileShareList,
    summary="노드의 공유 목록",
    responses={403: {"description": "read 권한 없음"}, 404: {"description": "노드 없음"}},
)
async def list_node_shares(
    node_id: str,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> FileShareList:
    node = await get_node_or_404(db, node_id)
    await assert_access(db, node, user=user, company_id=company_id, permission="read")
    rows = await list_shares_for_node(db, node_id=node.id)
    return FileShareList(shares=[_share_to_response(s, u) for s, u in rows])


@router.post(
    "/{node_id}/shares",
    response_model=FileShareResponse,
    status_code=201,
    summary="공유 추가 (사용자 grantee)",
    responses={
        400: {"description": "owner 자신에게 공유 시도"},
        403: {"description": "manage 권한 없음"},
        404: {"description": "노드 없음 또는 read 권한 없음 (마스킹)"},
    },
)
async def create_node_share(
    node_id: str,
    body: FileShareCreate,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> FileShareResponse:
    node = await get_node_or_404(db, node_id)
    await assert_access(db, node, user=user, company_id=company_id, permission="read")
    await assert_can_manage_shares(db, node, user=user)

    # 그룹(= 디렉터리 부서) 공유: 개인 공유와 분기. (docs/group-sharing.html)
    # 개인 공유처럼 owner/manage 면 가능 (scope 제한 없음). shared 는 이미 회사 전원이
    # 접근하므로 그룹 공유 의미가 없고, 의미 있는 건 personal 폴더를 부서에 여는 것 = 팀 폴더.
    if body.grantee_group_id:
        if not departments.groups_enabled():
            raise HTTPException(400, departments.GROUPS_DISABLED_DETAIL)
        if await is_vault_content(db, node.id):
            raise HTTPException(400, "보안 폴더는 그룹 공유를 지원하지 않습니다.")
        # 부서가 이 회사에 실재하는지 검증 + 표시명 확보.
        depts = await departments.list_departments(user, company_id)
        match = next(
            (
                d
                for d in depts
                if d.get("department_id") == body.grantee_group_id
                and d.get("company") == company_id
            ),
            None,
        )
        if match is None:
            raise HTTPException(404, "해당 부서를 찾을 수 없습니다.")
        share = await upsert_group_share(
            db,
            node=node,
            group_id=body.grantee_group_id,
            permission=body.permission,
            granted_by_sub=user.sub,
            expires_at=body.expires_at,
        )
        await write_audit(
            db,
            company_id=company_id,
            actor=user,
            action="share",
            entity_type="node",
            entity_id=node.id,
            meta={
                "group": body.grantee_group_id,
                "group_name": match.get("department"),
                "permission": body.permission,
            },
        )
        await db.commit()
        await db.refresh(share)
        return _share_to_response(share, None, group_name=match.get("department"))

    share = await upsert_share(
        db,
        node=node,
        grantee_sub=body.grantee_sub,
        permission=body.permission,
        granted_by_sub=user.sub,
        expires_at=body.expires_at,
    )
    await write_audit(
        db,
        company_id=company_id,
        actor=user,
        action="share",
        entity_type="node",
        entity_id=node.id,
        meta={"grantee": body.grantee_sub, "permission": body.permission},
    )
    pending = PendingDispatch()
    await notify(
        db,
        pending,
        recipient_sub=body.grantee_sub,
        company_id=company_id,
        actor_sub=user.sub,
        type_="node_shared",
        entity_type="node",
        entity_id=node.id,
        payload={
            "node_name": node.name,
            "kind": node.kind,
            "permission": body.permission,
        },
    )
    await db.commit()
    await pending.fire()
    await db.refresh(share)
    user_row = await db.get(User, body.grantee_sub)
    return _share_to_response(share, user_row)


@router.delete(
    "/{node_id}/shares/{share_id}",
    status_code=204,
    summary="공유 해제",
    responses={
        403: {"description": "manage 권한 없음"},
        404: {"description": "노드/share 없음"},
    },
)
async def delete_node_share(
    node_id: str,
    share_id: str,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> None:
    node = await get_node_or_404(db, node_id)
    await assert_access(db, node, user=user, company_id=company_id, permission="read")
    await assert_can_manage_shares(db, node, user=user)
    share = await get_share_or_404(db, share_id)
    if share.node_id != node.id:
        raise HTTPException(404, "Share not found")
    await db.delete(share)
    await write_audit(
        db,
        company_id=company_id,
        actor=user,
        action="unshare",
        entity_type="node",
        entity_id=node.id,
        meta={"grantee": share.grantee_sub},
    )
    await db.commit()


# ---------------------------------------------------------------------------
# 외부 공유 링크 (ExternalLink): 소유자만 관리
# ---------------------------------------------------------------------------


def _link_to_response(link: ExternalLink) -> ExternalLinkResponse:
    return ExternalLinkResponse(
        id=link.id,
        node_id=link.node_id,
        token=link.token,
        permission=link.permission,
        expires_at=link.expires_at,
        has_password=link.password_hash is not None,
        access_count=link.access_count or 0,
        last_accessed_at=link.last_accessed_at,
        created_at=link.created_at,
        revoked_at=link.revoked_at,
    )


@router.get(
    "/{node_id}/external-links",
    response_model=ExternalLinkList,
    summary="외부 링크 목록",
    responses={403: {"description": "manage 권한 없음"}},
)
async def list_external_links(
    node_id: str,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> ExternalLinkList:
    node = await get_node_or_404(db, node_id)
    await assert_access(db, node, user=user, company_id=company_id, permission="read")
    await assert_can_manage_shares(db, node, user=user)
    from sqlalchemy import select as _select

    stmt = (
        _select(ExternalLink)
        .where(ExternalLink.node_id == node.id)
        .order_by(ExternalLink.created_at.desc())
    )
    rows = list((await db.execute(stmt)).scalars().all())
    return ExternalLinkList(links=[_link_to_response(r) for r in rows])


@router.post(
    "/{node_id}/external-links",
    response_model=ExternalLinkResponse,
    status_code=201,
    summary="외부 링크 발급: 인증 없이 `/s/{token}` 으로 접근 가능",
    responses={
        403: {"description": "manage 권한 없음"},
        404: {"description": "노드 없음"},
    },
)
async def create_external_link(
    node_id: str,
    body: ExternalLinkCreate,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> ExternalLinkResponse:
    node = await get_node_or_404(db, node_id)
    await assert_access(db, node, user=user, company_id=company_id, permission="read")
    await assert_can_manage_shares(db, node, user=user)
    link = ExternalLink(
        id=new_link_id(),
        node_id=node.id,
        token=new_token(),
        permission=body.permission,
        expires_at=body.expires_at,
        password_hash=hash_password(body.password) if body.password else None,
        created_by_sub=user.sub,
    )
    db.add(link)
    await write_audit(
        db,
        company_id=company_id,
        actor=user,
        action="share",
        entity_type="node",
        entity_id=node.id,
        meta={"external": True, "permission": body.permission},
    )
    await db.commit()
    await db.refresh(link)
    return _link_to_response(link)


@router.delete(
    "/{node_id}/external-links/{link_id}",
    status_code=204,
    summary="외부 링크 철회: `revoked_at` 세팅",
    responses={
        403: {"description": "manage 권한 없음"},
        404: {"description": "링크/노드 없음"},
    },
)
async def revoke_external_link(
    node_id: str,
    link_id: str,
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
    db: AsyncSession = Depends(get_db),
) -> None:

    node = await get_node_or_404(db, node_id)
    await assert_access(db, node, user=user, company_id=company_id, permission="read")
    await assert_can_manage_shares(db, node, user=user)
    link = await db.get(ExternalLink, link_id)
    if link is None or link.node_id != node.id:
        raise HTTPException(404, "Link not found")
    link.revoked_at = datetime.now(UTC)
    await write_audit(
        db,
        company_id=company_id,
        actor=user,
        action="unshare",
        entity_type="node",
        entity_id=node.id,
        meta={"external": True, "link_id": link.id},
    )
    await db.commit()
