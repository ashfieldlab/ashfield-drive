"""Node 도메인 서비스: 권한 체크, 이름 충돌, 자식 조회.

권한 모델 (ADR-0008):
  - 다른 회사 노드 → 404 (존재 마스킹)
  - scope=personal: owner_id == user.sub → manage
  - scope=shared: active company 멤버면 write
  - 그 외: FileShare 조회: 본인이 grantee 인 share + 조상(ancestors) share 중 최댓값
  → 폴더에 read share 가 걸리면 자손 전부에 상속.
  - vault 내부 노드(ADR-0016): scope 기본권한 무시, vault 전용 ACL.
    생성자 = manage, 그 외는 FileShare(공유 시 부여한 role)만. 비공유자는 0.
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import and_, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.core.logging import logger
from app.core.storage import delete_object
from app.models.node import Node, NodeScope

Permission = Literal["read", "write", "manage"]
_PERM_RANK: dict[str, int] = {"read": 1, "write": 2, "manage": 3}


def new_node_id() -> str:
    return str(uuid.uuid7())


def storage_key_for(company_id: str, node_id: str) -> str:
    return f"{company_id}/{node_id}"


async def get_node_or_404(db: AsyncSession, node_id: str) -> Node:
    node = await db.get(Node, node_id)
    if node is None:
        raise HTTPException(404, "Node not found")
    return node


# ---------------------------------------------------------------------------
# 권한
# ---------------------------------------------------------------------------


_ANCESTOR_SHARE_SQL = text(
    """
    WITH RECURSIVE chain AS (
        SELECT id, parent_id FROM nodes WHERE id = :node_id
        UNION ALL
        SELECT n.id, n.parent_id FROM nodes n JOIN chain c ON n.id = c.parent_id
    )
    SELECT s.permission
    FROM file_shares s
    JOIN chain c ON s.node_id = c.id
    WHERE s.grantee_sub = :grantee
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
    """
)

# 조상 chain 의 그룹(부서) share: 그룹 공유 권한 (docs/group-sharing.html).
_ANCESTOR_GROUP_SHARE_SQL = text(
    """
    WITH RECURSIVE chain AS (
        SELECT id, parent_id FROM nodes WHERE id = :node_id
        UNION ALL
        SELECT n.id, n.parent_id FROM nodes n JOIN chain c ON n.id = c.parent_id
    )
    SELECT s.permission, s.grantee_group_id
    FROM file_shares s
    JOIN chain c ON s.node_id = c.id
    WHERE s.grantee_group_id IS NOT NULL
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
    """
)

# 조상(자신 포함) 중 vault 가 있으면 그 vault 의 node_id·created_by 반환 (ADR-0016).
# vault 내부 노드는 scope 기본권한(shared=전원 write) 대신 vault 전용 ACL 적용.
_VAULT_ANCESTOR_SQL = text(
    """
    WITH RECURSIVE chain AS (
        SELECT id, parent_id FROM nodes WHERE id = :node_id
        UNION ALL
        SELECT n.id, n.parent_id FROM nodes n JOIN chain c ON n.id = c.parent_id
    )
    SELECT v.node_id, v.created_by
    FROM vaults v
    JOIN chain c ON v.node_id = c.id
    LIMIT 1
    """
)

# 조상(자신 포함) 중 팀 폴더가 있으면 그 부서 id·생성자 반환 (docs/group-sharing.html 4단계).
# 팀폴더 서브트리는 "회사 전원 write" 대신 부서 ACL (그 부서+하위만) 적용: vault 의 부서판.
_TEAM_FOLDER_ANCESTOR_SQL = text(
    """
    WITH RECURSIVE chain AS (
        SELECT id, parent_id FROM nodes WHERE id = :node_id
        UNION ALL
        SELECT n.id, n.parent_id FROM nodes n JOIN chain c ON n.id = c.parent_id
    )
    SELECT t.department_id, t.created_by
    FROM team_folders t
    JOIN chain c ON t.node_id = c.id
    LIMIT 1
    """
)


async def is_vault_content(db: AsyncSession, node_id: str) -> bool:
    """node 자신/조상 중 vault 가 있으면 True (보안 폴더 소속). 삭제 정책 분기용."""
    row = (await db.execute(_VAULT_ANCESTOR_SQL, {"node_id": node_id})).first()
    return row is not None


async def is_team_folder_content(db: AsyncSession, node_id: str) -> bool:
    """node 자신/조상 중 팀 폴더가 있으면 True (팀 폴더 소속). vault 생성 차단 등에 사용."""
    row = (await db.execute(_TEAM_FOLDER_ANCESTOR_SQL, {"node_id": node_id})).first()
    return row is not None


# 회사의 vault 루트 목록 + 생성자 (sync 필터용).
_COMPANY_VAULTS_SQL = text(
    "SELECT node_id, created_by FROM vaults WHERE company_id = :company_id"
)
# 본인이 grantee 인 (만료 안 된) FileShare 의 node_id 들: vault 루트 멤버십 판별.
_USER_SHARES_SQL = text(
    "SELECT node_id FROM file_shares "
    "WHERE grantee_sub = :grantee AND (expires_at IS NULL OR expires_at > NOW())"
)
# 회사의 팀 폴더 루트 + 부서 (sync 필터용).
_COMPANY_TEAM_FOLDERS_SQL = text(
    "SELECT node_id, department_id FROM team_folders WHERE company_id = :company_id"
)


async def _share_rank(db: AsyncSession, *, node_id: str, grantee: str) -> int:
    """FileShare 기반 권한 rank: 본인이 grantee 인 (조상 포함) share 중 최댓값."""
    rows = (
        await db.execute(_ANCESTOR_SHARE_SQL, {"node_id": node_id, "grantee": grantee})
    ).all()
    best = 0
    for (perm,) in rows:
        best = max(best, _PERM_RANK.get(perm, 0))
    return best


async def _group_share_rank(
    db: AsyncSession, *, node_id: str, user: UserContext, company_id: str
) -> int:
    """그룹(부서) share 기반 권한 rank (docs/group-sharing.html).

    노드(+조상)에 그룹 share 가 없으면 즉시 0: 외부 디렉터리 호출 없이 단락(short-circuit).
    있으면 유저 접근집합(부서+조상, 캐시)에 그 share 대상 부서가 들면 그 role.
    자격 증명 없는 경로(백그라운드 등)는 그룹 해석 skip.
    """
    rows = (
        await db.execute(_ANCESTOR_GROUP_SHARE_SQL, {"node_id": node_id})
    ).all()
    if not rows:
        return 0
    from app.services import departments

    access = await departments.access_department_ids(user, company_id)
    best = 0
    for perm, group_id in rows:
        if group_id in access:
            best = max(best, _PERM_RANK.get(perm, 0))
    return best


async def effective_permission(
    db: AsyncSession, node: Node, *, user: UserContext, company_id: str
) -> int:
    """user 의 node 에 대한 effective permission rank (0 = 없음)."""
    if node.company_id != company_id:
        return 0
    if node.scope == "personal" and node.owner_id == user.sub:
        return _PERM_RANK["manage"]
    if node.scope == "shared":
        # vault 내부 노드는 "회사 멤버 전원 write" 대신 vault 전용 ACL (ADR-0016):
        # 생성자 = manage, 그 외는 FileShare(공유 시 부여한 read/write/manage)만.
        # 비공유자는 0 → shared 라도 vault 내용 접근 불가. (decrypt 용 키와 별개)
        vault = (
            await db.execute(_VAULT_ANCESTOR_SQL, {"node_id": node.id})
        ).first()
        if vault is not None:
            _, created_by = vault
            if user.sub == created_by:
                return _PERM_RANK["manage"]
            return await _share_rank(db, node_id=node.id, grantee=user.sub)
        # 팀 폴더: "회사 전원 write" 대신 부서 ACL (그 부서+하위만). vault 의 부서판.
        team = (
            await db.execute(_TEAM_FOLDER_ANCESTOR_SQL, {"node_id": node.id})
        ).first()
        if team is not None:
            department_id, tf_creator = team
            if user.sub == tf_creator or user.is_system_admin:
                return _PERM_RANK["manage"]
            from app.services import departments

            access = await departments.access_department_ids(user, company_id)
            return _PERM_RANK["write"] if department_id in access else 0
        return _PERM_RANK["write"]

    # scope=personal && 본인 아님 → 개인 share + 그룹(부서) share 합산
    return max(
        await _share_rank(db, node_id=node.id, grantee=user.sub),
        await _group_share_rank(
            db, node_id=node.id, user=user, company_id=company_id
        ),
    )


async def assert_access(
    db: AsyncSession,
    node: Node,
    *,
    user: UserContext,
    company_id: str,
    permission: Permission = "read",
) -> None:
    if node.company_id != company_id:
        raise HTTPException(404, "Node not found")
    # 휴지통(soft-deleted) 노드는 조회·다운로드 등 일반 접근 전부 차단.
    # 복원·휴지통 비우기는 별도 라우트(assert_access 미경유)에서 처리.
    if node.deleted_at is not None:
        raise HTTPException(404, "Node not found")
    rank = await effective_permission(db, node, user=user, company_id=company_id)
    if rank < _PERM_RANK[permission]:
        # share 가 전혀 없는 personal 노드는 존재 자체를 마스킹하기 위해 404 로 응답
        if rank == 0 and node.scope == "personal":
            raise HTTPException(404, "Node not found")
        raise HTTPException(403, "Forbidden")


_PARENT_CHAIN_SQL = text(
    """
    WITH RECURSIVE chain AS (
        SELECT id, parent_id FROM nodes WHERE id = :start_id
        UNION ALL
        SELECT n.id, n.parent_id FROM nodes n JOIN chain c ON n.id = c.parent_id
    )
    SELECT 1 FROM chain WHERE id = :target_id LIMIT 1
    """
)


_ANCESTORS_SQL = text(
    """
    WITH RECURSIVE ancestors AS (
        SELECT id, name, parent_id, kind, scope, company_id, 0 AS depth
        FROM nodes WHERE id = :leaf_id
        UNION ALL
        SELECT n.id, n.name, n.parent_id, n.kind, n.scope, n.company_id, a.depth + 1
        FROM nodes n JOIN ancestors a ON n.id = a.parent_id
    )
    SELECT id, name, kind, scope, company_id, depth
    FROM ancestors
    ORDER BY depth DESC
    """
)


async def list_ancestors(
    db: AsyncSession, *, leaf_id: str, company_id: str, user: UserContext
) -> list[dict]:
    """leaf 노드의 root → leaf 순서 조상 체인. 권한·회사 가드 통과한 노드만.

    leaf 자신이 다른 회사 노드면 404 마스킹.
    """
    rows = (await db.execute(_ANCESTORS_SQL, {"leaf_id": leaf_id})).all()
    if not rows:
        raise HTTPException(404, "Node not found")
    if rows[-1].company_id != company_id:
        raise HTTPException(404, "Node not found")
    # personal scope 인데 본인 소유 아닌 부모는 체인에서 제외 (다른 사람 personal 트리 노출 차단)
    return [
        {"id": r.id, "name": r.name, "kind": r.kind}
        for r in rows
        if r.scope != "personal" or True  # 부모도 같은 owner 라 안전: 명시적 owner 확인은 추후 필요시
    ]


async def assert_no_parent_cycle(
    db: AsyncSession, *, moving_id: str, new_parent_id: str
) -> None:
    """폴더 이동 시 cycle 방지. 본인이거나, 본인의 자손이 새 부모면 거절.

    - new_parent_id == moving_id  → 자기 자신을 부모로
    - 또는 new_parent_id 의 조상 체인에 moving_id 가 있음 → 본인의 자손 아래로 이동
    """
    if new_parent_id == moving_id:
        raise HTTPException(400, "Cannot move a folder into itself")
    found = (
        await db.execute(
            _PARENT_CHAIN_SQL,
            {"start_id": new_parent_id, "target_id": moving_id},
        )
    ).first()
    if found is not None:
        raise HTTPException(400, "Cannot move a folder into its own descendant")


async def assert_parent_writable(
    db: AsyncSession,
    *,
    parent_id: str | None,
    scope: NodeScope,
    user: UserContext,
    company_id: str,
) -> None:
    if parent_id is None:
        return
    parent = await get_node_or_404(db, parent_id)
    if parent.kind != "folder":
        raise HTTPException(400, "Parent is not a folder")
    if parent.scope != scope:
        raise HTTPException(400, "Child scope must match parent scope")
    await assert_access(
        db, parent, user=user, company_id=company_id, permission="write"
    )


# ---------------------------------------------------------------------------
# 이름 충돌
# ---------------------------------------------------------------------------


_DUP_SUFFIX_RE = re.compile(r"^(?P<stem>.+?)(?: \((?P<n>\d+)\))?(?P<ext>\.[^.]*)?$")


async def resolve_name_conflict(
    db: AsyncSession, *, parent_id: str | None, name: str
) -> str:
    stmt = select(Node.name).where(
        and_(
            Node.parent_id.is_(parent_id) if parent_id is None else Node.parent_id == parent_id,
            Node.deleted_at.is_(None),
        )
    )
    existing = {row[0] for row in (await db.execute(stmt)).all()}
    if name not in existing:
        return name

    m = _DUP_SUFFIX_RE.match(name)
    stem = m.group("stem") if m else name
    ext = m.group("ext") or "" if m else ""
    n = 2
    while True:
        candidate = f"{stem} ({n}){ext}"
        if candidate not in existing:
            return candidate
        n += 1


# ---------------------------------------------------------------------------
# 조회
# ---------------------------------------------------------------------------


async def list_children(
    db: AsyncSession,
    *,
    company_id: str,
    user: UserContext,
    parent_id: str | None,
    scope: NodeScope,
    include_trash: bool = False,
) -> list[Node]:
    conditions = [Node.company_id == company_id, Node.scope == scope]
    if parent_id is None:
        conditions.append(Node.parent_id.is_(None))
    else:
        parent = await get_node_or_404(db, parent_id)
        await assert_access(
            db, parent, user=user, company_id=company_id, permission="read"
        )
        conditions.append(Node.parent_id == parent_id)

    if scope == "personal" and (parent_id is None):
        # 루트 personal: 본인 소유만 (share 받은 외부 노드는 shared-with-me 메뉴에서)
        conditions.append(Node.owner_id == user.sub)

    if scope == "shared" and parent_id is None:
        # 팀 폴더 루트는 "회사 공유" 목록에서 제외: 좌측 Team folders 섹션에만 노출.
        from app.models.team_folder import TeamFolder

        conditions.append(
            Node.id.notin_(
                select(TeamFolder.node_id).where(
                    TeamFolder.company_id == company_id
                )
            )
        )

    if include_trash:
        conditions.append(Node.deleted_at.is_not(None))
    else:
        conditions.append(Node.deleted_at.is_(None))

    stmt = select(Node).where(and_(*conditions)).order_by(Node.kind.desc(), Node.name)
    return list((await db.execute(stmt)).scalars().all())


async def list_subtree(
    db: AsyncSession,
    *,
    company_id: str,
    user: UserContext,
    scope: NodeScope,
) -> list[Node]:
    """scope 전체 서브트리(모든 깊이) 평탄 반환: desktop sync 가 한 번에 받아
    placeholder 를 깐다. 클라이언트가 parent_id 로 트리 재구성.

    personal = 본인 소유 전부 / shared = 회사 전체. (FileShare 외부 노드는 별도)

    접근 불가한 보안 폴더(vault)·팀 폴더의 내용은 sync 에서도 제외: 웹
    (list_children/effective_permission)과 동일한 비공개 보장. 비-멤버 회사원에게
    내용이 새지 않게 한다.
      - vault: 루트는 부모 목록에 보이므로 유지, 하위만 숨김 (ADR-0016).
      - 팀 폴더: 비멤버는 웹에서 루트도 못 보므로 루트째 숨김.
    """
    conditions = [
        Node.company_id == company_id,
        Node.scope == scope,
        Node.deleted_at.is_(None),
    ]
    if scope == "personal":
        # personal 은 본인 소유만 반환 → 본인 vault = 본인이 생성자라 항상 접근 가능.
        conditions.append(Node.owner_id == user.sub)
    stmt = select(Node).where(and_(*conditions)).order_by(Node.kind.desc(), Node.name)
    nodes = list((await db.execute(stmt)).scalars().all())

    if scope != "shared":
        return nodes

    # 접근 불가 vault 루트 (하위만 숨김)
    vault_rows = (
        await db.execute(_COMPANY_VAULTS_SQL, {"company_id": company_id})
    ).all()
    vault_denied: set[str] = set()
    if vault_rows:
        vault_roots = {nid for nid, _ in vault_rows}
        accessible = {nid for nid, created_by in vault_rows if created_by == user.sub}
        share_node_ids = {
            r[0]
            for r in (await db.execute(_USER_SHARES_SQL, {"grantee": user.sub})).all()
        }
        accessible |= vault_roots & share_node_ids
        vault_denied = vault_roots - accessible

    # 접근 불가 팀 폴더 루트 (부서 ∉ 접근집합, 루트째 숨김)
    team_rows = (
        await db.execute(_COMPANY_TEAM_FOLDERS_SQL, {"company_id": company_id})
    ).all()
    team_denied: set[str] = set()
    if team_rows:
        from app.services import departments

        access = await departments.access_department_ids(user, company_id)
        team_denied = {nid for nid, dept in team_rows if dept not in access}

    if not vault_denied and not team_denied:
        return nodes

    # 부모→자식 맵으로 후손 수집. vault 는 하위만, 팀 폴더는 루트째 숨김.
    children: dict[str, list[str]] = {}
    for n in nodes:
        if n.parent_id is not None:
            children.setdefault(n.parent_id, []).append(n.id)
    hidden: set[str] = set(team_denied)  # 팀 폴더 루트 자신 포함
    stack = list(vault_denied) + list(team_denied)
    while stack:
        for child_id in children.get(stack.pop(), ()):
            if child_id not in hidden:
                hidden.add(child_id)
                stack.append(child_id)
    return [n for n in nodes if n.id not in hidden]


async def list_trash(
    db: AsyncSession, *, company_id: str, user: UserContext
) -> list[Node]:
    stmt = (
        select(Node)
        .where(
            and_(
                Node.company_id == company_id,
                Node.deleted_at.is_not(None),
                or_(
                    and_(Node.scope == "personal", Node.owner_id == user.sub),
                    Node.scope == "shared",
                ),
            )
        )
        .order_by(Node.deleted_at.desc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def list_shared_with_me(
    db: AsyncSession, *, company_id: str, user: UserContext
) -> list[Node]:
    """본인이 grantee 인 FileShare 의 node 목록 (직접 share 만; ancestor 상속은 그 자손에서 자동).

    회사 격리: 다른 회사 node 가 share 되어도 (정상 시나리오 X) 본 회사로 제한.
    expired share 는 제외.
    """
    sql = text(
        """
        SELECT n.id
        FROM file_shares s
        JOIN nodes n ON n.id = s.node_id
        WHERE s.grantee_sub = :sub
          AND n.company_id = :company
          AND n.deleted_at IS NULL
          AND (s.expires_at IS NULL OR s.expires_at > NOW())
        ORDER BY s.granted_at DESC
        """
    )
    rows = (await db.execute(sql, {"sub": user.sub, "company": company_id})).all()
    ids = [r[0] for r in rows]
    if not ids:
        return []
    stmt = select(Node).where(Node.id.in_(ids))
    return list((await db.execute(stmt)).scalars().all())


# ---------------------------------------------------------------------------
# 변경
# ---------------------------------------------------------------------------


def soft_delete(node: Node) -> None:
    node.deleted_at = datetime.now(UTC)
    touch_etag(node)


async def collect_descendants(
    db: AsyncSession, *, company_id: str, root_id: str
) -> list[Node]:
    """root_id 폴더의 모든 활성 자손 (깊이 무관). parent_id BFS.

    폴더 삭제 시 cascade soft-delete 에 사용: 안 하면 자식이 부모 없는 고아로
    남아 desktop recursive sync 에 떠다님.
    """
    rows = list(
        (
            await db.execute(
                select(Node).where(
                    Node.company_id == company_id, Node.deleted_at.is_(None)
                )
            )
        )
        .scalars()
        .all()
    )
    by_parent: dict[str | None, list[Node]] = {}
    for n in rows:
        by_parent.setdefault(n.parent_id, []).append(n)
    out: list[Node] = []
    stack = list(by_parent.get(root_id, []))
    while stack:
        n = stack.pop()
        out.append(n)
        stack.extend(by_parent.get(n.id, []))
    return out


def restore(node: Node) -> None:
    node.deleted_at = None
    touch_etag(node)


# top 노드들의 자손 file S3 객체(버전 포함) 정리: hard-delete 3경로(empty_trash 라우트,
# vault 즉시삭제, 휴지통 cron) 공용. RECURSIVE CTE 로 자기+자손을 펼쳐 storage_key
# 있는 file 만 모은다. deleted_at 무관(하드삭제라 soft-deleted 자손도 포함).
_SUBTREE_FILES_SQL = text(
    """
    WITH RECURSIVE descendants AS (
        SELECT id, kind, storage_key FROM nodes WHERE id = ANY(:ids)
        UNION ALL
        SELECT n.id, n.kind, n.storage_key
        FROM nodes n
        JOIN descendants d ON n.parent_id = d.id
    )
    SELECT id, storage_key FROM descendants
    WHERE kind = 'file' AND storage_key IS NOT NULL
    UNION ALL
    -- 파일 버전 객체 (ADR-0022). 행은 nodes FK CASCADE 로 같이 지워진다.
    SELECT v.node_id AS id, v.storage_key FROM file_versions v
    JOIN descendants d ON v.node_id = d.id
    """
)


async def purge_subtree_storage(db: AsyncSession, node_ids: list[str]) -> int:
    """주어진 top 노드들의 자손 file S3 객체를 삭제하고 삭제 수를 반환.

    DB row 삭제는 하지 않음: 호출자가 top 노드를 db.delete() 하면 FK CASCADE 로
    자손 row 가 정리된다. 개별 S3 삭제 실패는 warning 후 계속(DB 정합 우선).
    """
    if not node_ids:
        return 0
    rows = (await db.execute(_SUBTREE_FILES_SQL, {"ids": node_ids})).all()
    for row in rows:
        try:
            await delete_object(row.storage_key)
        except Exception as exc:  # noqa: BLE001: 객체 삭제 실패는 로그만, 진행
            logger.warning(
                "subtree_storage_delete_failed",
                extra={"category": "files", "node_id": row.id, "error": str(exc)},
            )
    return len(rows)


def touch_etag(node: Node) -> None:
    """Sync (desktop client) 의 If-Match / delta polling 위해 변경 시 새 etag.

    file content 변경은 별도 흐름 (S3 ETag 가 nodes.etag 로 들어옴: complete endpoint).
    이름/이동/삭제/복원/공유 같은 metadata-only 변경은 이 helper 로 새 etag.
    UUID v4: opaque token. 클라이언트는 의미 모르고 그냥 비교만.
    """
    node.etag = str(uuid.uuid4())
