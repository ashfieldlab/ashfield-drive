"""ExternalLink 도메인 — 토큰 발급, 비밀번호 PBKDF2, 만료/철회 확인.

비밀번호 저장 포맷: "salt_hex:hash_hex" (PBKDF2-SHA256, 100k iterations).
production 에서 부하 커지면 argon2/scrypt 로 교체 가능 — Phase 2 검토.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.external_link import ExternalLink

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
    stmt = select(ExternalLink).where(ExternalLink.token == token)
    link = (await db.execute(stmt)).scalar_one_or_none()
    if link is None or not is_active(link):
        raise HTTPException(404, "Link not found")
    return link


def new_link_id() -> str:
    return str(uuid.uuid7())


async def touch_access(db: AsyncSession, link: ExternalLink) -> None:
    """원자적 increment — 동시 다운로드 시 race 없이 카운터 +1.

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
