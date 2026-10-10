"""부서(그룹) 소스: 현재 비활성 (ADR-0023).

그룹 공유·부서(팀) 폴더는 외부 디렉터리(조직도)의 부서를 그룹으로 썼다 (docs/group-sharing.html).
외부 디렉터리 연동을 없애면서 로컬에는 부서 데이터가 없으므로 기능을 끈다:

  - 부서 목록은 항상 비어 있고, 사용자의 접근집합(부서+조상)도 비어 있다.
  - 그래서 기존 그룹 share 는 아무 권한도 주지 않고, 부서 폴더는 생성자·System Admin 만 접근한다.
  - 새 그룹 공유·부서 폴더 생성은 400.

로컬 그룹(워크스페이스 내 팀) 모델을 만들면 이 모듈만 채우면 된다: 호출부(nodes·team_folders·groups)는
이 함수 시그니처만 본다.
"""

from __future__ import annotations

from app.auth.context import UserContext

GROUPS_DISABLED_DETAIL = "그룹(부서) 공유·부서 폴더는 현재 지원하지 않습니다."


def groups_enabled() -> bool:
    """부서 소스가 있는가. 지금은 항상 False."""
    return False


async def list_departments(user: UserContext, workspace_id: str) -> list[dict]:
    """활성 워크스페이스의 부서 목록 (그룹 후보). 항목: department_id, department, workspace, ..."""
    return []


async def access_department_ids(user: UserContext, workspace_id: str) -> set[str]:
    """유저의 접근집합 (소속 부서 + 모든 조상 department_id)."""
    return set()
