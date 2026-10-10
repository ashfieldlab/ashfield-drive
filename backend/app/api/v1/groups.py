"""그룹(= 부서): 그룹 공유 기능 (docs/group-sharing.html).

현재 비활성: 부서 소스(외부 디렉터리)를 없애 목록·접근집합은 항상 비어 있다
(app/services/departments.py, ADR-0023). 경로는 유지: 로컬 그룹 모델이 생기면 채운다.
"""

from fastapi import APIRouter, Depends

from app.auth.context import UserContext
from app.auth.dependencies import get_current_user, require_active_company
from app.services import departments

router = APIRouter(prefix="/groups", tags=["groups"])


@router.get("", summary="그룹(부서) 목록: 현재 항상 빈 목록")
async def list_groups(
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
) -> list[dict]:
    """활성 회사의 부서 목록 (그룹 후보). 부서 소스가 없어 지금은 빈 목록."""
    return await departments.list_departments(user, company_id)


@router.get(
    "/my-access-set",
    summary="내 접근집합(부서+조상 id): 그룹 공유 권한 검증용 (디버그)",
)
async def my_access_set(
    user: UserContext = Depends(get_current_user),
    company_id: str = Depends(require_active_company),
) -> dict:
    """그룹 공유 권한 해석에 쓰이는 '접근집합'을 그대로 노출: 부서+조상 walk 확인용."""
    ids = await departments.access_department_ids(user, company_id)
    return {"access_department_ids": sorted(ids)}
