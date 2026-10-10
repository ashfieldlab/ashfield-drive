"""
JWKS 공개키 캐시 — Better Auth JWT 플러그인의 `/api/auth/jwks` (ADR-0023).

AUTH_JWKS_URL 에서 가져와 1시간 캐싱. 토큰 kid 가 캐시에 없으면 validator 가 강제 재조회
(키 회전 대응, 30초에 한 번까지). 개발·운영 경로가 같다 — 로컬 우회 키 같은 분기 없음.
"""

from __future__ import annotations

import time

import httpx

from app.core.config import settings
from app.core.logging import logger

_JWKS_TTL = 3600  # 1시간
# 모르는 kid 로 강제 재조회하는 최소 간격 — 위조 토큰 폭주가 JWKS 조회 폭주로 번지지 않게.
_FORCED_REFRESH_MIN_INTERVAL = 30.0

_jwks_cache: list[dict] | None = None
_jwks_cache_expiry: float = 0.0
_last_forced_refresh: float | None = None


async def _fetch_jwks(url: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return list(resp.json().get("keys", []))


async def get_jwks(*, force_refresh: bool = False) -> list[dict]:
    """JWKS 공개키 목록. 가져오지 못하면 빈 목록 (validator 가 503 으로 바꾼다).

    force_refresh: 키 회전 대응(모르는 kid). 최소 간격 안이면 캐시를 그대로 쓴다.
    """
    global _jwks_cache, _jwks_cache_expiry, _last_forced_refresh

    now = time.monotonic()
    if force_refresh:
        recently = (
            _last_forced_refresh is not None
            and now - _last_forced_refresh < _FORCED_REFRESH_MIN_INTERVAL
        )
        if not recently:
            _last_forced_refresh = now
            _jwks_cache = None
    if _jwks_cache is not None and now < _jwks_cache_expiry:
        return _jwks_cache

    if not settings.auth_jwks_url:
        logger.error("auth_jwks_url_missing", extra={"category": "auth"})
        return []

    try:
        keys = await _fetch_jwks(settings.auth_jwks_url)
    except (httpx.RequestError, httpx.HTTPStatusError, ValueError) as exc:
        logger.warning(
            "jwks_fetch_failed",
            extra={"category": "auth", "url": settings.auth_jwks_url, "error": str(exc)},
        )
        return []  # 실패는 캐시하지 않는다 — 다음 요청이 다시 시도

    _jwks_cache = keys
    _jwks_cache_expiry = now + _JWKS_TTL
    logger.debug(
        "jwks_cached",
        extra={"category": "auth", "key_count": len(keys), "ttl_s": _JWKS_TTL},
    )
    return keys


def invalidate_jwks_cache() -> None:
    """캐시 전체 초기화 (재조회 간격 기록 포함). 테스트·운영 도구용."""
    global _jwks_cache, _jwks_cache_expiry, _last_forced_refresh
    _jwks_cache = None
    _jwks_cache_expiry = 0.0
    _last_forced_refresh = None


__all__ = ["get_jwks", "invalidate_jwks_cache"]
