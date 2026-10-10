"""
첫 인증 요청 시 로컬 사용자·회사 준비 (ADR-0004, ADR-0023).

  1. users upsert — JWT sub 를 PK 로 email·name·image 저장 (바뀐 경우에만 UPDATE).
  2. user_company_memberships 조회 — 소속의 유일한 원천.
  3. 소속이 하나도 없으면 개인 워크스페이스를 만들고 admin 으로 넣는다.
     회사 ID 를 sub 로부터 결정적으로 만들고(`personal-{sub}`) ON CONFLICT DO NOTHING 으로
     넣으므로, 같은 사용자의 동시 첫 요청이 여럿이어도 회사·멤버십은 하나만 생긴다.

Redis throttle 없음 — 매 요청 SELECT 2회(사용자·멤버십), 변경이 있을 때만 쓰기.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import logger
from app.models.company import Company
from app.models.user import User
from app.models.user_company_membership import UserCompanyMembership

PERSONAL_COMPANY_PREFIX = "personal-"


@dataclass(frozen=True)
class Identity:
    """검증된 JWT 에서 꺼낸 신원."""

    sub: str
    email: str
    name: str | None
    image: str | None


@dataclass(frozen=True)
class Provisioned:
    company_ids: list[str]
    is_system_admin: bool


def identity_from_claims(claims: dict) -> Identity:
    email = str(claims.get("email") or "").strip()
    name = claims.get("name")
    image = claims.get("image")
    return Identity(
        sub=str(claims["sub"]),
        email=email,
        name=str(name)[:255] if name else None,
        image=str(image) if image else None,
    )


def personal_company_id(sub: str) -> str:
    return f"{PERSONAL_COMPANY_PREFIX}{sub}"


def personal_company_name(identity: Identity) -> str:
    base = identity.name or identity.email.split("@")[0] or "내"
    return f"{base}의 워크스페이스"[:255]


async def provision_user(db: AsyncSession, identity: Identity) -> Provisioned:
    user = await _upsert_user(db, identity)

    rows = (
        await db.execute(
            select(UserCompanyMembership.company_id)
            .where(UserCompanyMembership.user_sub == identity.sub)
            .order_by(UserCompanyMembership.company_id)
        )
    ).scalars().all()
    company_ids = list(rows)

    if not company_ids:
        company_ids = [await ensure_personal_company(db, identity)]

    is_admin = bool(user.is_system_admin) or (
        identity.email.lower() in settings.system_admin_email_set
    )
    return Provisioned(company_ids=company_ids, is_system_admin=is_admin)


async def _upsert_user(db: AsyncSession, identity: Identity) -> User:
    user = await db.get(User, identity.sub)
    if user is not None and (
        user.email == identity.email
        and user.name == identity.name
        and user.image == identity.image
    ):
        return user

    stmt = (
        pg_insert(User)
        .values(
            id=identity.sub,
            email=identity.email,
            name=identity.name,
            image=identity.image,
        )
        .on_conflict_do_update(
            index_elements=[User.id],
            set_={
                "email": identity.email,
                "name": identity.name,
                "image": identity.image,
            },
        )
    )
    await db.execute(stmt)
    user = await db.get(User, identity.sub, populate_existing=True)
    assert user is not None
    logger.info("user_upserted", extra={"category": "auth", "sub": identity.sub})
    return user


async def ensure_personal_company(db: AsyncSession, identity: Identity) -> str:
    """개인 워크스페이스 + admin 멤버십 (멱등, 동시 요청 안전). 회사 ID 반환."""
    company_id = personal_company_id(identity.sub)
    await db.execute(
        pg_insert(Company)
        .values(id=company_id, name=personal_company_name(identity))
        .on_conflict_do_nothing(index_elements=[Company.id])
    )
    await db.execute(
        pg_insert(UserCompanyMembership)
        .values(user_sub=identity.sub, company_id=company_id, role="admin")
        .on_conflict_do_nothing(
            index_elements=[
                UserCompanyMembership.user_sub,
                UserCompanyMembership.company_id,
            ]
        )
    )
    logger.info(
        "personal_company_ensured",
        extra={"category": "biz", "sub": identity.sub, "company_id": company_id},
    )
    return company_id
