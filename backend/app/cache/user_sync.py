"""
Lazy upsert — JWT claim 정보를 users/companies 테이블에 동기화.

Redis SETNX + TTL로 throttle:
  같은 사용자 5분에 1회만 실제 UPSERT 발생.

신선도는 JWT 수명(~5분)에 묶이므로 사용자·회사 정보 변경 → 다음 토큰 발급 후 반영.
ADR-0004 참조.
"""

from redis.exceptions import RedisError
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.core.redis import get_redis
from app.models.company import Company
from app.models.user import User
from app.models.user_company_membership import UserCompanyMembership

_SYNC_TTL = 300  # 5분
_SYNC_KEY_PREFIX = "sync:user:"


async def maybe_sync_user_cache(claims: dict, db: AsyncSession) -> None:
    """JWT claims로 users/companies upsert. throttle 안에 있으면 skip.

    Redis 장애 시 fail-open: throttle 없이 매 요청 UPSERT (캐시 신선도는 최선, 동작은 유지).
    """
    sub = claims.get("sub")
    if not sub:
        return

    throttled = False
    try:
        redis = get_redis()
        acquired = await redis.set(
            f"{_SYNC_KEY_PREFIX}{sub}", "1", ex=_SYNC_TTL, nx=True
        )
        throttled = not acquired  # 최근에 동기화함
    except RedisError as exc:
        logger.warning(
            "sync_throttle_redis_unavailable",
            extra={"category": "cache", "sub": sub, "error": str(exc)},
        )
        # Redis 죽었으면 throttle 없이 진행 — UPSERT는 그대로 수행 (DB는 살아있다는 가정)

    # throttle 키는 DB 커밋과 독립적으로 즉시 박히므로, sync 요청이 롤백되거나
    # DB만 리셋되면 throttle 은 "동기화함"인데 users 행이 없는 상태가 생긴다.
    # 그 상태로 skip 하면 owner FK 위반이 5분(TTL)간 지속 → user 행 존재를
    # 확인해 실제로 있을 때만 skip (없으면 throttle 무시하고 upsert = 자가복구).
    if throttled:
        exists = await db.scalar(select(User.id).where(User.id == sub))
        if exists:
            return

    email = claims.get("email", "")
    name = claims.get("name")

    await _upsert_user(db, sub=sub, email=email, name=name)

    groups = list(claims.get("groups", []))
    # 표시 이름은 외부 디렉터리가 준 값(게이트웨이 세션 경로). 없으면 ID 그대로 (dev·Bearer).
    names = claims.get("company_names") or {}
    for group_id in groups:
        await _upsert_company(db, company_id=group_id, name=names.get(group_id, group_id))
        await _upsert_membership(db, user_sub=sub, company_id=group_id)

    # 토큰 groups 에 없는 멤버십은 제거 — 회사에서 빠졌을 때 잔존 방지.
    # (company_admin 권한이 DB role 기준이라 유령 멤버십이 권한을 남길 수 있음)
    await _reconcile_memberships(db, sub=sub, current_company_ids=groups)

    logger.debug(
        "user_cache_synced",
        extra={"category": "cache", "sub": sub, "group_count": len(groups)},
    )


async def _upsert_user(db: AsyncSession, *, sub: str, email: str, name: str | None) -> None:
    stmt = (
        pg_insert(User)
        .values(id=sub, email=email, name=name)
        .on_conflict_do_update(
            index_elements=[User.id],
            set_={"email": email, "name": name},
        )
    )
    await db.execute(stmt)


async def _upsert_company(db: AsyncSession, *, company_id: str, name: str) -> None:
    stmt = (
        pg_insert(Company)
        .values(id=company_id, name=name)
        .on_conflict_do_update(
            index_elements=[Company.id],
            set_={"name": name},
        )
    )
    await db.execute(stmt)


async def _reconcile_memberships(
    db: AsyncSession, *, sub: str, current_company_ids: list[str]
) -> None:
    """현재 토큰 groups 에 없는 회사 멤버십 행 삭제. companies 테이블은 건드리지 않음
    (다른 사용자가 여전히 소속일 수 있음). groups 가 비면 그 사용자 멤버십 전체 삭제."""
    cond = [UserCompanyMembership.user_sub == sub]
    if current_company_ids:
        cond.append(UserCompanyMembership.company_id.notin_(current_company_ids))
    await db.execute(delete(UserCompanyMembership).where(*cond))


async def _upsert_membership(
    db: AsyncSession, *, user_sub: str, company_id: str
) -> None:
    stmt = (
        pg_insert(UserCompanyMembership)
        .values(user_sub=user_sub, company_id=company_id)
        .on_conflict_do_nothing(
            index_elements=[
                UserCompanyMembership.user_sub,
                UserCompanyMembership.company_id,
            ]
        )
    )
    await db.execute(stmt)
