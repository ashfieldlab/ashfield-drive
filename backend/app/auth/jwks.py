"""
JWKS 공개키 캐시.

운영: Keycloak JWKS endpoint에서 fetch, 1시간 캐싱
개발(SKIP_AUTH=true): + dev-keys/public.pem 추가

핵심: validate_jwt는 SKIP_AUTH를 모름. JWKS에 키가 있냐 없냐만 다름.
→ "키 회전" 패턴과 동일. 운영-개발 코드 경로 통일.
"""

from __future__ import annotations

import time
from pathlib import Path

import httpx
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
from cryptography.hazmat.primitives.serialization import load_pem_public_key

from app.core.config import settings
from app.core.logging import logger

_JWKS_TTL = 3600  # 1시간

_jwks_cache: list[dict] | None = None
_jwks_cache_expiry: float = 0.0


async def get_jwks() -> list[dict]:
    """JWKS 공개키 목록을 반환. Keycloak + (SKIP_AUTH면) dev 공개키."""
    global _jwks_cache, _jwks_cache_expiry

    now = time.monotonic()
    if _jwks_cache is not None and now < _jwks_cache_expiry:
        return _jwks_cache

    keys: list[dict] = []

    # 1) Keycloak JWKS (운영 키)
    if settings.oidc_jwks_url:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(settings.oidc_jwks_url)
                resp.raise_for_status()
                keys.extend(resp.json().get("keys", []))
        except (httpx.RequestError, httpx.HTTPStatusError) as exc:
            logger.warning(
                "jwks_fetch_failed",
                extra={"category": "auth", "url": settings.oidc_jwks_url, "error": str(exc)},
            )

    # 2) Dev 공개키 (SKIP_AUTH 시에만)
    if settings.skip_auth:
        try:
            keys.append(_load_dev_public_jwk())
        except FileNotFoundError as exc:
            logger.warning(
                "dev_public_key_missing",
                extra={"category": "auth", "path": settings.dev_public_key_path, "error": str(exc)},
            )

    _jwks_cache = keys
    _jwks_cache_expiry = now + _JWKS_TTL
    logger.debug(
        "jwks_cached",
        extra={"category": "auth", "key_count": len(keys), "ttl_s": _JWKS_TTL},
    )
    return keys


def invalidate_jwks_cache() -> None:
    """강제 무효화 — kid 매칭 실패 시 등 제한적 상황에서만 호출."""
    global _jwks_cache, _jwks_cache_expiry
    _jwks_cache = None
    _jwks_cache_expiry = 0.0


# -----------------------------------------------------------------------------
# Dev 공개키 → JWK 변환
# -----------------------------------------------------------------------------

def _load_dev_public_jwk() -> dict:
    """dev-keys/public.pem → JWK dict.

    kid는 SPEC의 합의값(dev-key-2026)을 사용. JWT header.kid와 매칭됨.
    """
    pem_path = Path(settings.dev_public_key_path)
    if not pem_path.is_absolute():
        # config.py는 backend/ 기준 상대경로를 받음 (../dev-keys/public.pem)
        pem_path = (Path(__file__).resolve().parents[2] / pem_path).resolve()
    pem_bytes = pem_path.read_bytes()
    public_key = load_pem_public_key(pem_bytes, backend=default_backend())
    if not isinstance(public_key, RSAPublicKey):
        raise RuntimeError(f"Expected RSA public key, got {type(public_key).__name__}")

    numbers = public_key.public_numbers()
    return {
        "kty": "RSA",
        "use": "sig",
        "alg": "RS256",
        "kid": "dev-key-2026",
        "n": _int_to_base64url(numbers.n),
        "e": _int_to_base64url(numbers.e),
    }


def _int_to_base64url(value: int) -> str:
    import base64

    byte_len = (value.bit_length() + 7) // 8
    raw = value.to_bytes(byte_len, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


__all__ = ["get_jwks", "invalidate_jwks_cache"]
