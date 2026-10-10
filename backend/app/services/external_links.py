"""ExternalLink 도메인: 토큰 발급, 비밀번호 PBKDF2, 만료/철회 확인.

비밀번호 저장 포맷: "salt_hex:hash_hex" (PBKDF2-SHA256, 100k iterations).
production 에서 부하 커지면 argon2/scrypt 로 교체 가능: Phase 2 검토.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.external_link import ExternalLink
from app.models.node import Node
from app.models.user import User
from app.models.vault import Vault
from app.services.nodes import is_vault_content

_PBKDF2_ITERATIONS = 100_000


def new_token() -> str:
    return secrets.token_urlsafe(24)


def hash_password(plain: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", plain.encode("utf-8"), salt, _PBKDF2_ITERATIONS
    )
    return f"{salt.hex()}:{digest.hex()}"


def verify_password(plain: str, stored: str) -> bool:
    try:
        salt_hex, hash_hex = stored.split(":", 1)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256", plain.encode("utf-8"), bytes.fromhex(salt_hex), _PBKDF2_ITERATIONS
    )
    return hmac.compare_digest(digest.hex(), hash_hex)


def is_active(link: ExternalLink) -> bool:
    if link.revoked_at is not None:
        return False
    if link.expires_at and link.expires_at <= datetime.now(UTC):
        return False
    return True


async def get_active_link_by_token(
    db: AsyncSession, token: str
) -> ExternalLink:
    """공개 접근용 링크 조회.

    없음, 철회 = 404 (구분하지 않음). 만료 = 410 + 공유한 사람 연락처 (만료 화면이 공유자에게
    다시 요청하게 안내). 철회는 공유자가 의도적으로 끊은 것이라 연락처를 주지 않는다.
    """
    stmt = select(ExternalLink).where(ExternalLink.token == token)
    link = (await db.execute(stmt)).scalar_one_or_none()
    if link is None or link.revoked_at is not None:
        raise HTTPException(404, "Link not found")
    if not is_active(link):
        name, email = await sharer_of(db, link)
        raise HTTPException(
            410,
            {
                "code": "link_expired",
                "sharer_name": name,
                "sharer_email": email,
                "expired_at": link.expires_at.isoformat() if link.expires_at else None,
            },
        )
    return link


async def sharer_of(db: AsyncSession, link: ExternalLink) -> tuple[str | None, str | None]:
    """(표시명, 이메일). 사용자 행이 없으면 (None, None)."""
    u = await db.get(User, link.created_by_sub)
    if u is None:
        return None, None
    return (u.name or u.email), u.email


def check_password(link: ExternalLink, password: str | None) -> None:
    """비밀번호 링크면 검증. 없음/틀림 = 401."""
    if link.password_hash is None:
        return
    if not password or not verify_password(password, link.password_hash):
        raise HTTPException(401, "Invalid password")


# 조상 체인 (자신 포함). 링크 루트의 자손인지 확인하는 데 쓴다.
_ANCESTORS_SQL = text(
    """
    WITH RECURSIVE chain AS (
        SELECT id, parent_id, deleted_at, 0 AS depth FROM nodes WHERE id = :node_id
        UNION ALL
        SELECT n.id, n.parent_id, n.deleted_at, c.depth + 1
        FROM nodes n JOIN chain c ON n.id = c.parent_id
        WHERE c.depth < 64
    )
    SELECT id, deleted_at FROM chain
    """
)

# 서브트리(자신 포함) 안에 보안 폴더 루트가 있는지
_SUBTREE_HAS_VAULT_SQL = text(
    """
    WITH RECURSIVE tree AS (
        SELECT id, 0 AS depth FROM nodes WHERE id = :root_id
        UNION ALL
        SELECT n.id, t.depth + 1 FROM nodes n JOIN tree t ON n.parent_id = t.id
        WHERE n.deleted_at IS NULL AND t.depth < 64
    )
    SELECT 1 FROM vaults v JOIN tree t ON v.node_id = t.id LIMIT 1
    """
)


async def link_root(db: AsyncSession, link: ExternalLink) -> Node:
    node = await db.get(Node, link.node_id)
    if node is None or node.deleted_at is not None:
        raise HTTPException(404, "Link not found")
    return node


async def resolve_in_link(db: AsyncSession, link: ExternalLink, node_id: str | None) -> Node:
    """링크 루트 또는 그 (삭제 안 된) 자손. 범위 밖이면 404, 보안 폴더 항목이면 403."""
    root = await link_root(db, link)
    target = root
    if node_id and node_id != root.id:
        chain = (await db.execute(_ANCESTORS_SQL, {"node_id": node_id})).all()
        ids = [r.id for r in chain]
        if root.id not in ids:
            raise HTTPException(404, "Not found")
        # 루트까지 가는 경로에 삭제된 노드가 있으면 안 보인다
        for r in chain:
            if r.id == root.id:
                break
            if r.deleted_at is not None:
                raise HTTPException(404, "Not found")
        found = await db.get(Node, node_id)
        if found is None:
            raise HTTPException(404, "Not found")
        target = found
    if await is_vault_content(db, target.id):
        raise HTTPException(403, "Secure folder content is not available via links")
    return target


async def list_public_children(db: AsyncSession, folder: Node) -> list[tuple[Node, bool]]:
    """폴더 바로 아래 항목 (삭제 안 됨, 업로드 완료). (node, available): 보안 폴더 루트는 available=False."""
    rows = list(
        (
            await db.execute(
                select(Node)
                .where(
                    Node.parent_id == folder.id,
                    Node.deleted_at.is_(None),
                    Node.status == "ready",
                )
                .order_by(Node.kind.desc(), Node.name)
            )
        )
        .scalars()
        .all()
    )
    if not rows:
        return []
    vault_ids = set(
        (
            await db.execute(
                select(Vault.node_id).where(Vault.node_id.in_([n.id for n in rows]))
            )
        )
        .scalars()
        .all()
    )
    return [(n, n.id not in vault_ids) for n in rows]


async def subtree_has_vault(db: AsyncSession, root_id: str) -> bool:
    return (await db.execute(_SUBTREE_HAS_VAULT_SQL, {"root_id": root_id})).first() is not None


async def breadcrumb(db: AsyncSession, root: Node, folder: Node) -> list[Node]:
    """링크 루트부터 folder 까지 (둘 다 포함)."""
    path = [folder]
    cur = folder
    while cur.id != root.id and cur.parent_id:
        parent = await db.get(Node, cur.parent_id)
        if parent is None:
            break
        path.append(parent)
        cur = parent
    return list(reversed(path))


def new_link_id() -> str:
    return str(uuid.uuid7())


async def touch_access(db: AsyncSession, link: ExternalLink) -> None:
    """원자적 increment: 동시 다운로드 시 race 없이 카운터 +1.

    SQL `access_count = access_count + 1` 로 DB 가 row lock 잡고 처리.
    """
    await db.execute(
        update(ExternalLink)
        .where(ExternalLink.id == link.id)
        .values(
            access_count=ExternalLink.access_count + 1,
            last_accessed_at=datetime.now(UTC),
        )
    )
