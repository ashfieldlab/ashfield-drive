"""
Session revocation — sid 기반.

Back-channel logout이 도착하면 `revoked_sid:{sid}` 키를 짧은 TTL(=AT 수명)로 SET.
이후 매 요청에서 JWT의 sid가 revoked되었는지 확인.

TTL 안에 토큰이 자연 만료하므로 청소 자동.

Redis 장애 정책 — fail-open:
  - revoke_sid: 실패 시 warn 로그만 (logout 즉시성 잃지만 시스템 계속 동작)
  - is_revoked: 실패 시 False 반환 (인증 통과 허용, JWT 자체는 여전히 검증됨)
  → 토큰 자연 만료(~5분)까지 한정된 격차. backend/CLAUDE.md 참조.
"""

from redis.exceptions import RedisError

from app.core.config import settings
from app.core.logging import logger
from app.core.redis import get_redis

_KEY_PREFIX = "revoked_sid:"


async def revoke_sid(sid: str, *, ttl: int | None = None) -> None:
    """sid 무효화. TTL은 기본 access_token_max_lifetime.
    Redis 장애 시 logout 즉시성을 잃지만 예외는 삼킴."""
    if not sid:
        return
    try:
        redis = get_redis()
        await redis.set(
            f"{_KEY_PREFIX}{sid}",
            "1",
            ex=ttl or settings.access_token_max_lifetime,
        )
        logger.info("sid_revoked", extra={"category": "cache", "sid": sid})
    except RedisError as exc:
        logger.warning(
            "revoke_sid_redis_unavailable",
            extra={"category": "cache", "sid": sid, "error": str(exc)},
        )


async def is_revoked(sid: str | None) -> bool:
    """Redis 장애 시 fail-open (False 반환) — JWT 자체는 여전히 검증되므로 안전.
    완벽한 즉시 무효화가 필요하면 Redis 가용성 확보 필요."""
    if not sid:
        return False
    try:
        redis = get_redis()
        return await redis.exists(f"{_KEY_PREFIX}{sid}") > 0
    except RedisError as exc:
        logger.warning(
            "is_revoked_redis_unavailable",
            extra={"category": "cache", "sid": sid, "error": str(exc)},
        )
        return False
