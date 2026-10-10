"""
Redis 클라이언트 — revocation cache + lazy upsert throttle 용도.

앱 lifecycle:
  startup: get_redis()가 lazy 생성
  shutdown: close_redis() 호출
"""

import redis.asyncio as aioredis

from app.core.config import settings

_redis: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.close()
        _redis = None
