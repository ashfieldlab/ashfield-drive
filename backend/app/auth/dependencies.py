"""
FastAPI dependencies — 인증/인가.

  get_current_user        — 자격 증명(Bearer JWT 또는 게이트웨이 세션) 해석 + lazy upsert → UserContext
  require_active_company  — X-Active-Company-Id 헤더 검증 (JWT groups에 포함되는지)
  require_admin           — System Admin role 검증
  require_company_admin   — 활성 회사의 admin (System Admin 은 super-set, ADR-0010)
"""

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.gateway_session import SESSION_ID_HEADER, claims_from_session
from app.auth.revocation import is_revoked
from app.auth.validator import validate_jwt
from app.cache.user_sync import maybe_sync_user_cache
from app.core.db import get_db
from app.core.logging import logger
from app.models.user_company_membership import UserCompanyMembership


async def _resolve_claims(
    authorization: str | None, session_id: str | None
) -> tuple[dict, str, str | None]:
    """호출자의 claims 를 얻는다. 자격 증명 경로는 둘뿐이다.

    1. `Authorization: Bearer`: Keycloak 토큰(데스크톱 싱크·서버 간 호출)이나 dev 키로
       서명한 JWT(로컬). JWKS 로 검증하고 sid revocation 을 본다.
    2. `X-Ashfield-Session-ID`: 게이트웨이 세션(운영 웹). 게이트웨이 `/auth/me` 에 묻는다.
       세션이 죽으면 그쪽이 401 이라 revocation 조회가 필요 없다.

    반환: (claims, Bearer 토큰 또는 "", 게이트웨이 세션 ID 또는 None).
    """
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
        claims = await validate_jwt(token)
        sid = claims.get("sid")
        if await is_revoked(sid):
            logger.info(
                "request_blocked_revoked_sid",
                extra={"category": "auth", "sid": sid},
            )
            raise HTTPException(status_code=401, detail="Session revoked")
        return claims, token, None

    if session_id:
        return await claims_from_session(session_id), "", session_id

    raise HTTPException(
        status_code=401,
        detail="Missing credentials (Bearer token or X-Ashfield-Session-ID)",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    authorization: str | None = Header(None),
    session_id: str | None = Header(None, alias=SESSION_ID_HEADER),
    db: AsyncSession = Depends(get_db),
) -> UserContext:
    claims, token, gateway_sid = await _resolve_claims(authorization, session_id)

    # 회사 ID 정규화 — companies 클레임(D4) 우선, 없으면 groups. Keycloak 그룹 경로의
    # 앞 슬래시(예: /한글회사)를 떼어 DB/시드 규약(무슬래시)과 맞춘다. upsert·UserContext 공통.
    companies = [
        str(g).lstrip("/")
        for g in (claims.get("companies") or claims.get("groups") or [])
    ]
    claims = {**claims, "groups": companies}

    # users/companies 캐시 동기화 (throttle 적용)
    await maybe_sync_user_cache(claims, db)

    return UserContext(
        sub=claims["sub"],
        email=claims.get("email", ""),
        name=claims.get("name"),
        groups=companies,
        roles=list(claims.get("realm_access", {}).get("roles", [])),
        sid=claims.get("sid"),
        access_token=token,
        session_id=gateway_sid,
    )


def require_active_company(
    user: UserContext = Depends(get_current_user),
    x_active_company_id: str = Header(..., alias="X-Active-Company-Id"),
) -> str:
    """헤더의 X-Active-Company-Id가 JWT groups에 포함되어야 함.

    한글 회사 ID(예: Keycloak group '한글회사') 의 ByteString 한계 회피를 위해
    frontend 가 percent-encode 해서 보냄 → 여기서 unquote.
    """
    from urllib.parse import unquote

    x_active_company_id = unquote(x_active_company_id)
    if not user.is_member_of(x_active_company_id):
        logger.warning(
            "active_company_not_member",
            extra={
                "category": "authz",
                "sub": user.sub,
                "requested_company": x_active_company_id,
                "user_groups": user.groups,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this company",
        )
    return x_active_company_id


def require_admin(user: UserContext = Depends(get_current_user)) -> UserContext:
    if not user.is_system_admin:
        logger.warning(
            "admin_required",
            extra={"category": "authz", "sub": user.sub, "user_roles": user.roles},
        )
        raise HTTPException(status_code=403, detail="Admin only")
    return user


async def require_company_admin(
    company_id: str,  # path param — `{company_id}` 가 있는 라우트에서만 사용
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserContext:
    """path 의 company_id 에 대한 admin (role='admin' 또는 System Admin). ADR-0010.

    System Admin 은 회사 멤버 아니어도 통과 (super-set). 회사 admin 은
    그 회사 의 row.role=='admin' 일 때만. 다른 회사 path 침범 불가.
    """
    if user.is_system_admin:
        return user
    membership = await db.get(UserCompanyMembership, (user.sub, company_id))
    if membership is not None and membership.role == "admin":
        return user
    logger.warning(
        "company_admin_required",
        extra={
            "category": "authz",
            "sub": user.sub,
            "company_id": company_id,
            "current_role": membership.role if membership else None,
        },
    )
    raise HTTPException(status_code=403, detail="Company admin only")
