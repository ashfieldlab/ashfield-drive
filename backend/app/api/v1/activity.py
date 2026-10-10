"""/api/v1/me/activity: 본인 관련 audit_log 타임라인.

본인 관련 =
  - 본인이 한 행동
  - 본인이 받은 알림에 연결된 entity
  - 누구든 "내 노드"에 한 행동: 본인 소유 노드, 본인이 직접 공유받은 노드, 그 폴더들의 자손
    (다른 사람이 내 폴더에 올린 파일, 공유받은 폴더 안에서의 변경 등)
관리자 전체 audit 와 달리 일반 사용자가 볼 수 있음. 열람 기록(file_access)은 제외.

화면이 "김하늘님이 디자인에 로고.svg를 올렸습니다" 같은 문장과 열기/위치 보기를 만들 수 있게
현재 노드 상태(이름, 부모, 삭제 여부)와 공유 대상, 이동 전후 폴더 이름을 함께 내려준다.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import and_, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.dependencies import get_current_user, require_active_workspace
from app.core.db import get_db
from app.models.audit_log import AuditLog
from app.models.node import Node
from app.models.notification import Notification
from app.models.user import User
from app.services.audit import FILE_ACCESS


class ActivityNode(BaseModel):
    """audit 대상 노드의 현재 상태. 영구 삭제됐으면 item.node = None."""

    id: str
    name: str | None  # 보안 폴더 항목이면 None (암호문 이름 비노출)
    kind: str
    mime: str | None
    scope: str
    parent_id: str | None
    parent_name: str | None  # 루트면 None
    deleted: bool


class ActivityItem(BaseModel):
    id: str
    actor_sub: str | None
    actor_name: str | None  # users 캐시에서 표시명: 없으면 None (UI fallback 처리)
    actor_image: str | None = None
    action: str
    entity_type: str
    entity_id: str
    meta: dict
    created_at: datetime
    node: ActivityNode | None = None
    grantee_name: str | None = None  # share/unshare 대상 표시명
    old_parent_name: str | None = None  # 이동 전 폴더 (루트면 None)
    new_parent_name: str | None = None  # 이동 후 폴더 (루트면 None)
    # 생성(업로드) 당시 폴더 이름: meta.parent_id 기준 (그 뒤 옮겨져도 원래 위치). 루트면 None
    created_in_name: str | None = None


class ActivityResponse(BaseModel):
    items: list[ActivityItem]


router = APIRouter(prefix="/me", tags=["activity"])


# 본인 소유 노드 + 본인이 직접 공유받은(만료 안 된) 노드, 그리고 그 자손 전부 (삭제된 것 포함:
# 삭제/복원 기록도 보여야 하므로). UNION 이 중복과 순환을 걸러 낸다.
_VISIBLE_TREE_CTE = """
WITH RECURSIVE visible(id) AS (
    SELECT n.id FROM nodes n
    WHERE n.workspace_id = :workspace AND n.owner_id = :sub
    UNION
    SELECT s.node_id FROM file_shares s
    JOIN nodes n ON n.id = s.node_id
    WHERE s.grantee_sub = :sub
      AND n.workspace_id = :workspace
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
    UNION
    SELECT c.id FROM nodes c
    JOIN visible v ON c.parent_id = v.id
    WHERE c.workspace_id = :workspace
)
"""

_RELATED_NODE_LOGS_SQL = text(
    _VISIBLE_TREE_CTE
    + """
SELECT a.id FROM audit_logs a
WHERE a.workspace_id = :workspace
  AND a.entity_type = 'node'
  AND a.entity_id IN (SELECT id FROM visible)
ORDER BY a.created_at DESC
LIMIT :limit
"""
)

_VISIBLE_SUBSET_SQL = text(
    _VISIBLE_TREE_CTE + "SELECT id FROM visible WHERE id = ANY(:ids)"
)


@router.get(
    "/activity",
    response_model=ActivityResponse,
    summary="본인 활동 타임라인",
)
async def my_activity(
    limit: int = Query(50, ge=1, le=200),
    user: UserContext = Depends(get_current_user),
    workspace_id: str = Depends(require_active_workspace),
    db: AsyncSession = Depends(get_db),
) -> ActivityResponse:
    params = {"workspace": workspace_id, "sub": user.sub}

    # 본인이 받은 알림에 연결된 entity_id 집합: 본인이 영향받은 변경 추적
    notif_entity_ids_stmt = select(Notification.entity_id).where(
        and_(
            Notification.recipient_sub == user.sub,
            Notification.workspace_id == workspace_id,
        )
    )
    notif_ids = {
        row[0] for row in (await db.execute(notif_entity_ids_stmt)).all()
    }

    # 내 노드 트리에서 일어난 최근 기록 id (최대 limit 개): 트리 크기와 무관하게 결과는 bounded.
    related_ids = [
        r[0]
        for r in (
            await db.execute(_RELATED_NODE_LOGS_SQL, {**params, "limit": limit})
        ).all()
    ]

    # 열람 기록은 활동 내역에서 뺀다: 양이 많아 실제 변경 활동을 밀어낸다 (감사로그 화면 전용).
    who = [AuditLog.actor_sub == user.sub]
    if notif_ids:
        who.append(AuditLog.entity_id.in_(notif_ids))
    if related_ids:
        who.append(AuditLog.id.in_(related_ids))
    stmt = (
        select(AuditLog)
        .where(
            AuditLog.workspace_id == workspace_id,
            AuditLog.entity_type != FILE_ACCESS,
            or_(*who),
        )
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    rows = list((await db.execute(stmt)).scalars().all())

    # 사용자 표시명 한 번에 조회 (actor + 공유 대상): N+1 회피
    user_ids = {r.actor_sub for r in rows if r.actor_sub}
    for r in rows:
        g = r.meta.get("grantee") if r.action in ("share", "unshare") else None
        if isinstance(g, str):
            user_ids.add(g)
    users: dict[str, User] = {}
    if user_ids:
        for u in (
            await db.execute(select(User).where(User.id.in_(user_ids)))
        ).scalars():
            users[u.id] = u

    def display(sub: str | None) -> str | None:
        if not sub:
            return None
        u = users.get(sub)
        return (u.name or u.email or u.id) if u else None

    # 대상 노드와 부모, 이동 전후 폴더를 한 번에 조회
    node_ids = {r.entity_id for r in rows if r.entity_type == "node" and r.entity_id != "*"}
    nodes: dict[str, Node] = {}
    if node_ids:
        for n in (await db.execute(select(Node).where(Node.id.in_(node_ids)))).scalars():
            nodes[n.id] = n

    folder_ids: set[str] = set()
    for n in nodes.values():
        if n.parent_id:
            folder_ids.add(n.parent_id)
    for r in rows:
        if r.action in ("update", "create") and not r.meta.get("vault"):
            for k in ("old_parent_id", "new_parent_id", "parent_id"):
                v = r.meta.get(k)
                if isinstance(v, str):
                    folder_ids.add(v)
    folder_names: dict[str, str] = {}
    if folder_ids:
        # 폴더 이름은 내가 볼 수 있는 트리 안의 것만 (남의 폴더 이름 비노출)
        allowed = {
            row[0]
            for row in (
                await db.execute(
                    _VISIBLE_SUBSET_SQL, {**params, "ids": list(folder_ids)}
                )
            ).all()
        }
        if allowed:
            for n in (
                await db.execute(select(Node).where(Node.id.in_(allowed)))
            ).scalars():
                folder_names[n.id] = n.name

    def node_ref(r: AuditLog) -> ActivityNode | None:
        n = nodes.get(r.entity_id) if r.entity_type == "node" else None
        if n is None:
            return None
        vault = bool(r.meta.get("vault")) or n.wrapped_dek is not None
        return ActivityNode(
            id=n.id,
            name=None if vault else n.name,
            kind=n.kind,
            mime=n.mime,
            scope=n.scope,
            parent_id=n.parent_id,
            parent_name=None if vault or not n.parent_id else folder_names.get(n.parent_id),
            deleted=n.deleted_at is not None,
        )

    def folder_name(r: AuditLog, key: str) -> str | None:
        v = r.meta.get(key)
        return folder_names.get(v) if isinstance(v, str) else None

    items: list[ActivityItem] = []
    for r in rows:
        grantee = r.meta.get("grantee") if r.action in ("share", "unshare") else None
        actor = users.get(r.actor_sub) if r.actor_sub else None
        items.append(
            ActivityItem(
                id=r.id,
                actor_sub=r.actor_sub,
                actor_name=display(r.actor_sub),
                actor_image=actor.image if actor else None,
                action=r.action,
                entity_type=r.entity_type,
                entity_id=r.entity_id,
                meta=r.meta,
                created_at=r.created_at,
                node=node_ref(r),
                grantee_name=display(grantee) if isinstance(grantee, str) else None,
                old_parent_name=folder_name(r, "old_parent_id") if r.action == "update" else None,
                new_parent_name=folder_name(r, "new_parent_id") if r.action == "update" else None,
                created_in_name=folder_name(r, "parent_id") if r.action == "create" else None,
            )
        )
    return ActivityResponse(items=items)
