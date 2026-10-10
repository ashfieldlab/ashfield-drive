"""그룹(= 디렉터리 부서) — 그룹 공유 기능 (docs/group-sharing.html).

검증 단계: 유저의 access token 을 외부 디렉터리로 포워딩(B·리소스서버)해 부서 목록을
끌어온다. workspace 백엔드가 게이트웨이 없이 디렉터리 조직도를 읽을 수 있는지 확인.
"""

from fastapi import APIRouter, Depends

from app.auth.context import UserContext
from app.auth.dependencies import get_current_user, require_active_company
from app.services import external_directory

router = APIRouter(prefix="/groups", tags=["groups"])


@router.get("", summary="그룹(부서) 목록 — 디렉터리 조직도")
async def list_groups(
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
) -> list[dict]:
    """활성 회사의 부서 목록 (그룹 후보). 외부 디렉터리 API 그대로 반환."""
    return await external_directory.list_departments(user, company_id)


@router.get(
    "/my-access-set",
    summary="내 접근집합(부서+조상 id) — 그룹 공유 권한 검증용 (디버그)",
)
async def my_access_set(
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
) -> dict:
    """그룹 공유 권한 해석에 쓰이는 '접근집합'을 그대로 노출 — 부서+조상 walk 확인용."""
    ids = await external_directory.access_department_ids(user, company_id)
    return {"access_department_ids": sorted(ids)}
