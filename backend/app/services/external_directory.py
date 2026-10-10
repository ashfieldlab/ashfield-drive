"""외부 디렉터리(조직도) 어댑터. 그룹 공유 기능이 디렉터리 부서를 그룹으로 사용.
설계: docs/group-sharing.html

호출자의 자격 증명으로 그 사용자 권한의 응답을 받는다. 경로는 자격 증명에 따라 둘:
  - Bearer(데스크톱 싱크 Keycloak 토큰 등): 외부 디렉터리에 직접. 디렉터리가
    Bearer 토큰을 검증한다.
  - 게이트웨이 세션(운영 웹): 게이트웨이 `/api/directory/method/*` 경유. 이때 회사 컨텍스트는
    게이트웨이 세션의 선택 회사로 정해지고 요청 헤더로는 못 바꾼다(게이트웨이 설계).
"""

from __future__ import annotations

import time
from urllib.parse import quote

import httpx
from fastapi import HTTPException

from app.auth.context import UserContext
from app.auth.gateway_session import SESSION_ID_HEADER
from app.core.config import settings
from app.core.logging import logger

_TIMEOUT = httpx.Timeout(5.0)

# 그룹 공유 권한검사용 "접근집합"(부서+조상 department_id) 캐시.
# 메모리 TTL — 멀티 인스턴스면 추후 Redis 로 승격. 멤버십 변경 반영은 TTL 만큼 지연
# (추후 외부 디렉터리 웹훅으로 무효화). 키 = user_sub.
_ACCESS_TTL = 300.0
_access_cache: dict[str, tuple[float, set[str]]] = {}


def _target(path: str, user: UserContext) -> tuple[str, dict[str, str]]:
    """자격 증명에 맞는 (URL, 헤더). path 는 외부 디렉터리 `/api/` 뒤 경로 (예: "method/x", "v1/...").

    Bearer 면 외부 디렉터리 직접, 세션이면 게이트웨이 경유 (게이트웨이 /api/directory/{path} → 외부 디렉터리 /api/{path}).
    """
    if user.access_token:
        if not settings.directory_url:
            raise HTTPException(503, "외부 디렉터리 연동이 설정되지 않았습니다 (DIRECTORY_URL).")
        url = f"{settings.directory_url.rstrip('/')}/api/{path}"
        return url, {"Authorization": f"Bearer {user.access_token}"}
    if user.session_id:
        if not settings.gateway_url:
            raise HTTPException(503, "게이트웨이 연동이 설정되지 않았습니다 (GATEWAY_URL).")
        url = f"{settings.gateway_url.rstrip('/')}/api/directory/{path}"
        return url, {SESSION_ID_HEADER: user.session_id}
    raise HTTPException(401, "외부 디렉터리를 호출할 자격 증명이 없습니다.")


async def _call(path: str, user: UserContext, params: dict | None = None) -> object:
    """디렉터리 REST(v1/...)를 호출자 자격 증명으로 GET 하고 본문을 반환.

    회사 컨텍스트는 경로의 회사 ID 로 준다. 게이트웨이 경유면 게이트웨이가 세션의 선택
    회사를 X-Forwarded-Company 로 붙인다.
    """
    url, headers = _target(path, user)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as cli:
            resp = await cli.get(url, params=params or {}, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning(
            "directory_call_failed",
            extra={"category": "api", "path": path, "error": str(exc)},
        )
        raise HTTPException(502, f"외부 디렉터리 호출 실패: {exc}") from exc

    if resp.status_code != 200:
        logger.warning(
            "directory_call_status",
            extra={"category": "api", "path": path, "status": resp.status_code},
        )
        raise HTTPException(502, f"외부 디렉터리 응답 오류 ({resp.status_code})")

    return resp.json()


async def list_departments(user: UserContext, company_id: str) -> list[dict]:
    """활성 회사의 부서 목록 (그룹 후보). 디렉터리 REST 디렉터리 API.

    API 는 회사 단위이고 회사 ID 는 디렉터리 회사 PK (= 워크스페이스 회사 ID).
    각 항목: department_id, department, parent, company, company_name, is_group, member_count.
    """
    data = await _call(f"v1/companies/{quote(company_id, safe='')}/directory/departments", user)
    return (data or {}).get("items", []) if isinstance(data, dict) else []


# REST 조직도. 레거시 company_group.get_group_organization 은 외부 디렉터리쪽에서 제거 예정이라 쓰지 않는다.
# 응답의 items 는 레거시와 같은 모양(회사 블록마다 departments·employees).


async def _compute_access_set(user: UserContext, company_id: str) -> set[str]:
    """유저 부서 + 모든 조상의 department_id 집합 (그룹 share 매칭용).

    REST 조직도 사용 — parent_department 가 id 라 id 로 바로 위로 walk.
    employees 에서 내 user_id 로 부서를 찾는다. 활성 회사 블록 기준.

    회사 id 일치를 먼저 본다: 게이트웨이 경유면 isCurrentCompany 가 게이트웨이 세션의
    선택 회사라 workspace 활성 회사와 다를 수 있다.
    """
    data = await _call(f"v1/companies/{quote(company_id, safe='')}/organization", user)
    org = data.get("items") if isinstance(data, dict) else None
    if not isinstance(org, list):
        return set()
    block = next(
        (b for b in org if (b.get("company") or {}).get("id") == company_id), None
    ) or next((b for b in org if b.get("isCurrentCompany")), None)
    if block is None:
        return set()

    parent_of = {
        d["name"]: (d.get("parent_department") or None)
        for d in block.get("departments", [])
    }
    me = next(
        (
            e
            for e in block.get("employees", [])
            if user.email in (e.get("user_id"), e.get("company_email"))
        ),
        None,
    )
    dept = me.get("department") if me else None
    if not dept:
        return set()

    acc: set[str] = set()
    cur: str | None = dept
    while cur and cur not in acc:
        acc.add(cur)
        cur = parent_of.get(cur)
    return acc


async def access_department_ids(user: UserContext, company_id: str) -> set[str]:
    """유저의 접근집합(부서+조상 id) — 회사별/유저별 메모리 TTL 캐시."""
    key = f"{user.sub}:{company_id}"
    now = time.monotonic()
    hit = _access_cache.get(key)
    if hit is not None and hit[0] > now:
        return hit[1]
    ids = await _compute_access_set(user, company_id)
    _access_cache[key] = (now + _ACCESS_TTL, ids)
    return ids
