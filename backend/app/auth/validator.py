"""
JWT 검증 — JWKS 공개키 + RS256.

핵심: SKIP_AUTH 분기 없음. JWKS에 dev 공개키가 추가됐을 뿐
운영 토큰이든 dev 토큰이든 같은 함수가 검증.
"""

from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.auth.jwks import get_jwks, invalidate_jwks_cache
from app.core.config import settings
from app.core.logging import logger


def _unverified(token: str) -> dict:
    """진단용 — 서명 검증 없이 claims 일부만. 실패 원인(iss/aud/exp) 파악."""
    try:
        c = jwt.get_unverified_claims(token)
        return {
            "tok_iss": c.get("iss"),
            "tok_aud": c.get("aud"),
            "tok_azp": c.get("azp"),
            "tok_exp": c.get("exp"),
            "exp_iss": settings.oidc_issuer or None,
            "exp_aud": settings.oidc_audience or None,
        }
    except Exception:
        return {}


async def validate_jwt(token: str) -> dict:
    """JWT 검증 + claims 반환. 실패 시 HTTPException(401)."""
    keys = await get_jwks()
    if not keys:
        logger.error("jwks_empty", extra={"category": "auth"})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="JWKS not available",
        )

    try:
        return _decode(token, keys)
    except JWTError as exc:
        # 키 회전 가능성 — 한 번만 캐시 무효화 후 재시도
        msg = str(exc).lower()
        if "kid" in msg or "no key found" in msg:
            invalidate_jwks_cache()
            keys = await get_jwks()
            try:
                return _decode(token, keys)
            except JWTError as exc2:
                logger.warning(
                    "jwt_validation_failed",
                    extra={"category": "auth", "reason": str(exc2), "retry": True,
                           **_unverified(token)},
                )
                raise HTTPException(status_code=401, detail="Token validation failed") from exc2

        logger.warning(
            "jwt_validation_failed",
            extra={"category": "auth", "reason": str(exc), "retry": False,
                   **_unverified(token)},
        )
        raise HTTPException(status_code=401, detail="Token validation failed") from exc


def _decode(token: str, keys: list[dict]) -> dict:
    """python-jose decode — multi-key JWKS 지원, kid로 매칭."""
    decode_kwargs: dict = {
        "algorithms": ["RS256"],
        "options": {
            "verify_exp": True,
            "verify_nbf": True,
            "verify_iat": True,
        },
    }

    # audience 검증 — 설정된 경우만
    if settings.oidc_audience:
        decode_kwargs["audience"] = settings.oidc_audience
    else:
        decode_kwargs["options"]["verify_aud"] = False

    # issuer — 운영 issuer + dev "dev-issuer" 둘 다 허용 (SKIP_AUTH)
    if settings.oidc_issuer and settings.skip_auth:
        # 둘 다 허용해야 — python-jose는 단일 issuer만 받으므로 우회
        decode_kwargs["options"]["verify_iss"] = False
        claims = jwt.decode(token, {"keys": keys}, **decode_kwargs)
        iss = claims.get("iss", "")
        if iss not in (settings.oidc_issuer, "dev-issuer"):
            raise JWTError(f"Invalid issuer: {iss}")
        return claims

    if settings.oidc_issuer:
        decode_kwargs["issuer"] = settings.oidc_issuer
    elif settings.skip_auth:
        decode_kwargs["issuer"] = "dev-issuer"
    else:
        decode_kwargs["options"]["verify_iss"] = False

    return jwt.decode(token, {"keys": keys}, **decode_kwargs)
