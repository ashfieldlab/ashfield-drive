"""
인증 요청마다 로컬 사용자·소속 준비 (ADR-0004, ADR-0024).

신원과 소속의 원천은 Ashfield 계정 서버다. 액세스 토큰(JWT)에 실린 값으로 로컬 캐시를 맞춘다.

  1. users upsert: JWT sub 를 PK 로 email·name·picture 저장 (바뀐 경우에만 UPDATE).
  2. `workspaces` 클레임 → 로컬 회사·멤버십 동기화. 클레임의 해시가 users.workspaces_claim_hash
     와 같으면 건너뛴다 (보통의 요청은 쓰기 없음). 다르면:
       - 워크스페이스마다 companies 행 upsert (account_workspace_id 로 찾고, 없으면
         id = account_workspace_id = 워크스페이스 ID 로 생성, 이름이 바뀌었으면 갱신)
       - 이 사용자의 멤버십 upsert (role: owner·admin → admin, member → member)
       - 클레임에서 빠진 계정 워크스페이스의 멤버십 삭제 (레거시 로컬 회사 멤버십은 그대로)
     모두 ON CONFLICT 기반이라 같은 사용자의 동시 요청이 겹쳐도 결과가 같다.
  3. user_company_memberships 조회 → UserContext.groups.

개인 워크스페이스는 계정 서버가 가입 때 만든다: 앱은 따로 만들지 않는다.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import logger
from app.models.company import Company
from app.models.user import User
from app.models.user_company_membership import CompanyRole, UserCompanyMembership

# 계정 서버 역할 → 앱 역할 (계약 ADR-0001 §6). 모르는 값은 member (최소 권한).
_ROLE_MAP: dict[str, CompanyRole] = {"owner": "admin", "admin": "admin", "member": "member"}


@dataclass(frozen=True)
class Workspace:
    """토큰 `workspaces[]` 한 항목 (역할은 앱 역할로 변환된 값)."""

    id: str
    name: str
    role: CompanyRole


@dataclass(frozen=True)
class Identity:
    """검증된 JWT 에서 꺼낸 신원.

    workspaces=None 은 클레임 자체가 없는 토큰: 소속을 건드리지 않는다
    (계정 서버 토큰엔 항상 있다. 빈 목록이면 "소속 없음" 으로 반영).
    """

    sub: str
    email: str
    name: str | None
    image: str | None
    workspaces: tuple[Workspace, ...] | None = None


@dataclass(frozen=True)
class Provisioned:
    company_ids: list[str]
    is_system_admin: bool


def map_role(role: object) -> CompanyRole:
    return _ROLE_MAP.get(str(role), "member")


def _parse_workspaces(raw: object) -> tuple[Workspace, ...] | None:
    if raw is None:
        return None
    if not isinstance(raw, list):
        logger.warning("workspaces_claim_malformed", extra={"category": "auth"})
        return None
    seen: dict[str, Workspace] = {}
    for item in raw:
        if not isinstance(item, dict):
            continue
        ws_id = str(item.get("id") or "").strip()
        if not ws_id or len(ws_id) > 128:
            continue
        name = str(item.get("name") or ws_id)[:255]
        seen[ws_id] = Workspace(id=ws_id, name=name, role=map_role(item.get("role")))
    return tuple(sorted(seen.values(), key=lambda w: w.id))


def identity_from_claims(claims: dict) -> Identity:
    email = str(claims.get("email") or "").strip()
    name = claims.get("name")
    # 계정 서버는 OIDC 표준 `picture`. (`image` 는 예전 앱 내부 JWT 호환)
    image = claims.get("picture") or claims.get("image")
    return Identity(
        sub=str(claims["sub"]),
        email=email,
        name=str(name)[:255] if name else None,
        image=str(image) if image else None,
        workspaces=_parse_workspaces(claims.get("workspaces")),
    )


def workspaces_hash(workspaces: tuple[Workspace, ...]) -> str:
    """동기화 결과를 바꾸는 값(id·name·앱 역할)만으로 만든 안정적인 해시."""
    canonical = json.dumps(
        [[w.id, w.name, w.role] for w in workspaces], ensure_ascii=False, separators=(",", ":")
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


async def provision_user(db: AsyncSession, identity: Identity) -> Provisioned:
    user = await _upsert_user(db, identity)

    if identity.workspaces is not None:
        claim_hash = workspaces_hash(identity.workspaces)
        if user.workspaces_claim_hash != claim_hash:
            await sync_workspaces(db, identity.sub, identity.workspaces)
            await db.execute(
                update(User).where(User.id == identity.sub).values(workspaces_claim_hash=claim_hash)
            )
            user.workspaces_claim_hash = claim_hash

    rows = (
        await db.execute(
            select(UserCompanyMembership.company_id)
            .where(UserCompanyMembership.user_sub == identity.sub)
            .order_by(UserCompanyMembership.company_id)
        )
    ).scalars().all()

    is_admin = bool(user.is_system_admin) or (
        identity.email.lower() in settings.system_admin_email_set
    )
    return Provisioned(company_ids=list(rows), is_system_admin=is_admin)


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


async def sync_workspaces(
    db: AsyncSession, sub: str, workspaces: tuple[Workspace, ...]
) -> None:
    """토큰의 워크스페이스 목록으로 이 사용자의 계정-워크스페이스 멤버십을 정확히 맞춘다 (멱등)."""
    ws_ids = [w.id for w in workspaces]
    company_by_ws = await _ensure_companies(db, workspaces)

    desired: dict[str, CompanyRole] = {
        company_by_ws[w.id]: w.role for w in workspaces if w.id in company_by_ws
    }
    current: dict[str, str] = dict(
        (
            await db.execute(
                select(UserCompanyMembership.company_id, UserCompanyMembership.role)
                .join(Company, Company.id == UserCompanyMembership.company_id)
                .where(
                    UserCompanyMembership.user_sub == sub,
                    Company.account_workspace_id.is_not(None),
                )
            )
        ).all()
    )

    for company_id, role in desired.items():
        if current.get(company_id) == role:
            continue
        stmt = pg_insert(UserCompanyMembership).values(
            user_sub=sub, company_id=company_id, role=role
        )
        await db.execute(
            stmt.on_conflict_do_update(
                index_elements=[UserCompanyMembership.user_sub, UserCompanyMembership.company_id],
                set_={"role": stmt.excluded.role},
            )
        )

    removed = [cid for cid in current if cid not in desired]
    if removed:
        await db.execute(
            delete(UserCompanyMembership).where(
                UserCompanyMembership.user_sub == sub,
                UserCompanyMembership.company_id.in_(removed),
            )
        )

    logger.info(
        "workspaces_synced",
        extra={
            "category": "auth",
            "sub": sub,
            "workspaces": ws_ids,
            "added_or_changed": [c for c, r in desired.items() if current.get(c) != r],
            "removed": removed,
        },
    )


async def _ensure_companies(
    db: AsyncSession, workspaces: tuple[Workspace, ...]
) -> dict[str, str]:
    """워크스페이스 ID → 로컬 companies.id. 없으면 만들고, 이름이 바뀌었으면 갱신."""
    if not workspaces:
        return {}
    ws_ids = [w.id for w in workspaces]

    async def load() -> dict[str, tuple[str, str]]:
        rows = (
            await db.execute(
                select(Company.account_workspace_id, Company.id, Company.name).where(
                    Company.account_workspace_id.in_(ws_ids)
                )
            )
        ).all()
        return {awid: (cid, name) for awid, cid, name in rows}

    existing = await load()
    missing = [w for w in workspaces if w.id not in existing]
    if missing:
        await db.execute(
            pg_insert(Company)
            .values([{"id": w.id, "name": w.name, "account_workspace_id": w.id} for w in missing])
            .on_conflict_do_nothing()
        )
        existing = await load()
        lost = [w.id for w in missing if w.id not in existing]
        if lost:
            # companies.id 가 같은 레거시 행이 있어 만들지 못함: 운영자가 그 행의
            # account_workspace_id 를 채워 연결해야 한다.
            logger.error(
                "workspace_company_id_conflict", extra={"category": "auth", "workspaces": lost}
            )

    for w in workspaces:
        if w.id in existing and existing[w.id][1] != w.name:
            await db.execute(
                update(Company).where(Company.id == existing[w.id][0]).values(name=w.name)
            )

    return {awid: cid for awid, (cid, _) in existing.items()}
