"""게이트웨이 세션(ashfield_sid)으로 신원을 얻는다.

운영 웹은 인증 게이트웨이가 Keycloak 로그인과 세션을 담당하고,
브라우저에는 불투명한 `ashfield_sid` 쿠키만 남는다. 게이트웨이는 access_token 을
클라이언트에 내주지 않으므로 BFF 는 Bearer 를 만들 수 없다.

그래서 BFF 가 sid 를 `X-Ashfield-Session-ID` 로 넘기고, 백엔드가 게이트웨이 `GET /auth/me`
에 신원을 직접 묻는다(게이트웨이가 신원의 단일 진실). 응답을 JWT claims 모양으로
바꿔 기존 경로(lazy upsert, UserContext)에 그대로 태운다.

Bearer(데스크톱 싱크의 Keycloak 토큰, 로컬 dev JWT)는 이 경로를 타지 않는다.

회사 소속은 외부 디렉터리가 원천이다(Keycloak 그룹은 외부 디렉터리를 따라오지 않는다). /auth/me 를 물은
김에 디렉터리 REST `/api/v1/me/context` 로 소속 회사(PK)와 표시 이름도 받아 같은 30초 캐시에 담는다 —
캐시를 따로 두면 "세션은 살았는데 소속은 낡은" 순간이 생긴다.
Bearer 경로(데스크톱 싱크)는 아직 Keycloak 그룹을 쓴다 (외부 디렉터리 Bearer 경로 미검증).
"""

from __future__ import annotations

import json

import httpx
from fastapi import HTTPException
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.logging import logger
from app.core.redis import get_redis

SESSION_ID_HEADER = "X-Ashfield-Session-ID"

# 게이트웨이 왕복을 줄이는 짧은 캐시. 동시에 "로그아웃이 반영되기까지의 지연"
# 상한이기도 하다: 늘리려면 그 창을 감수할 수 있는지 먼저 판단할 것.
_CACHE_TTL_SECONDS = 30
_CACHE_PREFIX = "gw_me:"
# 디렉터리 REST 내 컨텍스트 (게이트웨이가 세션 → 교환 토큰 Bearer 를 붙여 넘긴다).
_MY_CONTEXT_PATH = "/api/directory/v1/me/context"


def to_claims(me: dict) -> dict:
    """`/auth/me` 응답을 JWT claims 모양으로 바꾼다.

    롤은 평탄한 `roles` 로 온다. 회사 소속(`companies`)은 여기서 안 쓰고 외부 디렉터리에서 따로
    받는다 (/auth/me 의 companies 는 Keycloak 그룹이라 외부 디렉터리를 따라오지 않는다).
    세션이 죽으면 `/auth/me` 가 401 이라 revocation 을 따로 볼 필요가 없다(sid 없음).
    """
    return {
        "sub": me.get("sub"),
        "email": me.get("email"),
        "name": me.get("name") or me.get("preferred_username"),
        "preferred_username": me.get("preferred_username"),
        "realm_access": {"roles": me.get("roles") or []},
    }


async def claims_from_session(sid: str) -> dict:
    """게이트웨이 세션 ID 로 신원 claims 를 얻는다. 실패하면 HTTPException."""
    if not settings.gateway_url:
        logger.error("gateway_url_missing", extra={"category": "auth"})
        raise HTTPException(503, "Gateway not configured")

    cached = await _cache_get(sid)
    if cached is not None:
        return cached

    url = f"{settings.gateway_url.rstrip('/')}/auth/me"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, headers={SESSION_ID_HEADER: sid})
    except httpx.RequestError as exc:
        # 401 이 아니라 503: 401 로 내리면 프론트가 로그인으로 튕기고, 게이트웨이
        # 장애 중엔 그 로그인도 실패해 무한 왕복이 된다.
        logger.warning(
            "gateway_me_unreachable",
            extra={"category": "auth", "url": url, "error": str(exc)},
        )
        raise HTTPException(503, "Gateway unavailable") from exc

    if resp.status_code == 401:
        raise HTTPException(401, "Gateway session invalid")
    if resp.status_code != 200:
        logger.warning(
            "gateway_me_failed",
            extra={"category": "auth", "url": url, "status": resp.status_code},
        )
        raise HTTPException(503, "Gateway error")

    claims = to_claims(resp.json())
    if not claims["sub"]:
        raise HTTPException(401, "Gateway session has no subject")
    claims["companies"], claims["company_names"] = await _member_companies(sid)
    await _cache_set(sid, claims)
    return claims


async def _member_companies(sid: str) -> tuple[list[str], dict[str, str]]:
    """외부 디렉터리 소속 회사 (PK 목록, PK→표시 이름). 실패는 503 — 빈 목록으로 바꾸면 사용자가
    아무 잘못 없이 "접근 권한 없음" 으로 튕긴다. 401 이 아닌 이유는 claims_from_session 과 같다.

    PK(id)는 회사명 편집에도 안 바뀐다. 표시 이름(name)은 편집되면 PK 와 갈린다.
    """
    url = f"{settings.gateway_url.rstrip('/')}{_MY_CONTEXT_PATH}"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, headers={SESSION_ID_HEADER: sid})
    except httpx.RequestError as exc:
        logger.warning("directory_membership_unreachable", extra={"category": "auth", "error": str(exc)})
        raise HTTPException(503, "회사 소속 정보를 조회할 수 없습니다") from exc
    if resp.status_code != 200:
        logger.warning(
            "directory_membership_failed", extra={"category": "auth", "status": resp.status_code}
        )
        raise HTTPException(503, "회사 소속 정보를 조회할 수 없습니다")

    context = resp.json() or {}
    ids: list[str] = []
    names: dict[str, str] = {}
    for entry in context.get("companies") or []:
        if not isinstance(entry, dict):
            continue
        key = entry.get("id") or entry.get("name")
        if isinstance(key, str) and key.strip() and key not in names:
            ids.append(key)
            names[key] = entry.get("name") or key
    return ids, names


# Redis 장애는 조용히 통과(매번 게이트웨이에 묻게 될 뿐 안전). revocation.py 의 fail-open 과 같은 결.


async def _cache_get(sid: str) -> dict | None:
    try:
        raw = await get_redis().get(f"{_CACHE_PREFIX}{sid}")
    except RedisError as exc:
        logger.warning(
            "gateway_me_cache_unavailable",
            extra={"category": "cache", "error": str(exc)},
        )
        return None
    return json.loads(raw) if raw else None


async def _cache_set(sid: str, claims: dict) -> None:
    try:
        await get_redis().setex(
            f"{_CACHE_PREFIX}{sid}", _CACHE_TTL_SECONDS, json.dumps(claims)
        )
    except RedisError as exc:
        logger.warning(
            "gateway_me_cache_write_failed",
            extra={"category": "cache", "error": str(exc)},
        )
