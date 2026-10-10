"""
JWT 검증 — Better Auth JWKS 공개키 + RS256, iss/aud 필수 (ADR-0023).

검증 생략 모드는 없다. AUTH_ISSUER·AUTH_AUDIENCE 가 비어 있으면 503 (설정 오류를
"아무 토큰이나 통과" 로 바꾸지 않기 위함).
"""

from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.auth.jwks import get_jwks
from app.core.config import settings
from app.core.logging import logger

# Better Auth jwt 플러그인은 keyPairConfig 로 RS256 을 쓰도록 설정한다 (frontend/lib/auth.ts).
_ALGORITHMS = ["RS256"]


def _unverified(token: str) -> dict:
    """진단용 — 서명 검증 없이 claims 일부만. 실패 원인(iss/aud/exp) 파악."""
    try:
        c = jwt.get_unverified_claims(token)
        return {
            "tok_iss": c.get("iss"),
            "tok_aud": c.get("aud"),
            "tok_exp": c.get("exp"),
            "exp_iss": settings.auth_issuer or None,
            "exp_aud": settings.auth_audience or None,
        }
    except Exception:
        return {}


async def validate_jwt(token: str) -> dict:
    """JWT 검증 + claims 반환. 실패 시 HTTPException(401), 설정·JWKS 문제는 503."""
    if not (settings.auth_issuer and settings.auth_audience):
        logger.error("auth_issuer_or_audience_missing", extra={"category": "auth"})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth not configured",
        )

    keys = await get_jwks()
    if not keys:
        logger.error("jwks_empty", extra={"category": "auth"})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="JWKS not available",
        )

    # 키 회전 — 토큰 kid 가 캐시된 JWKS 에 없으면 재조회 (jwks.py 가 간격 제한).
    kid = _unverified_kid(token)
    if kid and kid not in {k.get("kid") for k in keys}:
        keys = await get_jwks(force_refresh=True)

    try:
        return _decode(token, keys)
    except JWTError as exc:
        logger.warning(
            "jwt_validation_failed",
            extra={"category": "auth", "reason": str(exc), **_unverified(token)},
        )
        raise HTTPException(status_code=401, detail="Token validation failed") from exc


def _unverified_kid(token: str) -> str | None:
    try:
        kid = jwt.get_unverified_header(token).get("kid")
    except JWTError:
        return None
    return kid if isinstance(kid, str) else None


def _decode(token: str, keys: list[dict]) -> dict:
    """python-jose decode — multi-key JWKS 지원, kid 로 매칭. exp·iss·aud·sub 필수."""
    return jwt.decode(
        token,
        {"keys": keys},
        algorithms=_ALGORITHMS,
        audience=settings.auth_audience,
        issuer=settings.auth_issuer,
        options={
            "verify_exp": True,
            "verify_nbf": True,
            "verify_iat": True,
            "verify_aud": True,
            "verify_iss": True,
            "require_exp": True,
            "require_sub": True,
        },
    )
