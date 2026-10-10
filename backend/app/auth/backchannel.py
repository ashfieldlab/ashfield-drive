"""
OIDC Back-channel Logout 수신 엔드포인트.

Keycloak이 사용자 로그아웃 시 logout_token JWT를 POST.
검증 후 sid를 Redis revocation cache에 SET.

스펙: https://openid.net/specs/openid-connect-backchannel-1_0.html
"""

from fastapi import APIRouter, Form
from fastapi.responses import Response

from app.auth.revocation import revoke_sid
from app.auth.validator import validate_jwt
from app.core.logging import logger

router = APIRouter()

_BACKCHANNEL_EVENT = "http://schemas.openid.net/event/backchannel-logout"


@router.post("/auth/backchannel-logout", include_in_schema=False)
async def backchannel_logout(logout_token: str = Form(...)) -> Response:
    """logout_token 검증 후 sid revoke. 응답: 200/400 (OIDC spec)."""
    try:
        claims = await validate_jwt(logout_token)
    except Exception:
        logger.warning("backchannel_invalid_token", extra={"category": "auth"})
        return Response(status_code=400)

    # 1) events 클레임 필수
    if _BACKCHANNEL_EVENT not in claims.get("events", {}):
        logger.warning(
            "backchannel_missing_event",
            extra={"category": "auth", "events": claims.get("events")},
        )
        return Response(status_code=400)

    # 2) nonce 금지 (replay 방지)
    if "nonce" in claims:
        logger.warning("backchannel_has_nonce", extra={"category": "auth"})
        return Response(status_code=400)

    # 3) sid 추출 — sub 기반 revoke는 지원 안 함 (ADR-0003)
    sid = claims.get("sid")
    if not sid:
        logger.warning("backchannel_missing_sid", extra={"category": "auth"})
        return Response(status_code=400)

    await revoke_sid(sid)
    return Response(status_code=200)
