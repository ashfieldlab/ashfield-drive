"""
FastAPI dependencies: 인증/인가 (ADR-0024).

  get_current_user       : Bearer JWT(계정 서버 액세스 토큰, JWKS 검증) + 로컬 사용자·소속 동기화 → UserContext
  require_active_company : X-Active-Company-Id 헤더 검증 (로컬 멤버십에 포함되는지)
  require_admin          : System Admin 검증
  require_company_admin  : 활성 회사의 admin (System Admin 은 super-set, ADR-0010)
"""

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import UserContext
from app.auth.provisioning import identity_from_claims, provision_user
from app.auth.validator import validate_jwt
from app.core.db import get_db
from app.core.logging import logger
from app.models.user_company_membership import UserCompanyMembership


async def get_current_user(
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> UserContext:
    """자격 증명은 `Authorization: Bearer <JWT>` 하나뿐이다: Ashfield 계정 서버의 액세스 토큰.

    웹은 BFF 가 Better Auth 계정 테이블에 저장된 토큰(만료 전 refresh)을 붙이고, 데스크톱
    클라이언트도 계정 서버에서 받은 같은 모양의 토큰을 쓴다. 우회 경로(dev 키·세션 헤더) 없음.
    가입 허용 여부(허용 이메일 등)는 계정 서버가 판단한다.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing credentials (Bearer token)",
            headers={"WWW-Authenticate": "Bearer"},
        )
    claims = await validate_jwt(authorization.split(" ", 1)[1].strip())
    identity = identity_from_claims(claims)
    provisioned = await provision_user(db, identity)
    return UserContext(
        sub=identity.sub,
        email=identity.email,
        name=identity.name,
        groups=provisioned.company_ids,
        roles=["admin"] if provisioned.is_system_admin else [],
    )


def require_active_company(
    user: UserContext = Depends(get_current_user),
    x_active_company_id: str = Header(..., alias="X-Active-Company-Id"),
) -> str:
    """헤더의 X-Active-Company-Id 가 사용자의 소속 회사여야 함.

    비 ASCII 회사 ID 의 ByteString 한계 회피를 위해 frontend 가 percent-encode 해서
    보냄 → 여기서 unquote.
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
    company_id: str,  # path param: `{company_id}` 가 있는 라우트에서만 사용
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
