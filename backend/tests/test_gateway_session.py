"""게이트웨이 세션(X-Ashfield-Session-ID) 인증 경로.

운영 웹은 BFF 가 ashfield_sid 를 헤더로 넘기고 백엔드가 게이트웨이 `/auth/me` 에 묻는다.
게이트웨이는 httpx MockTransport 로 대체한다.
"""

import httpx
import pytest

from app.auth import gateway_session
from app.auth.context import UserContext
from app.core.config import settings
from app.services import external_directory

ME = {
    "sub": "gw-user",
    "email": "gw@test.local",
    "name": "게이트웨이 사용자",
    # Keycloak 그룹 — 소속 판정엔 안 쓴다 (외부 디렉터리가 원천)
    "companies": ["/stale-keycloak-group"],
    "roles": ["admin"],
}
# 디렉터리 REST /api/v1/me/context — 소속의 원천. id = Company PK, name = 표시 이름.
DIRECTORY_CONTEXT = {
    "companies": [{"id": "acme-corp", "name": "ACME 주식회사"}],
}


@pytest.fixture
def gateway(monkeypatch):
    """게이트웨이 응답을 흉내낸다. calls 에 받은 요청을 쌓는다."""
    calls: list[httpx.Request] = []
    state = {"status": 200, "body": ME, "raise": False, "directory_status": 200}

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if state["raise"]:
            raise httpx.ConnectError("down", request=request)
        if request.url.path.endswith("/me/context"):
            return httpx.Response(state["directory_status"], json=DIRECTORY_CONTEXT)
        return httpx.Response(state["status"], json=state["body"])

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        gateway_session.httpx,
        "AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw),
    )
    monkeypatch.setattr(settings, "gateway_url", "https://gw.test")
    return calls, state


@pytest.mark.asyncio
async def test_session_header_resolves_identity(client, gateway):
    calls, _ = gateway
    res = await client.get("/api/v1/me", headers={"X-Ashfield-Session-ID": "sid-1"})
    assert res.status_code == 200
    body = res.json()
    assert body["sub"] == "gw-user"
    # 소속은 외부 디렉터리 회사(PK). Keycloak 그룹은 안 쓴다.
    assert body["groups"] == ["acme-corp"]
    assert body["is_system_admin"] is True
    assert str(calls[0].url) == "https://gw.test/auth/me"
    assert calls[0].headers["X-Ashfield-Session-ID"] == "sid-1"
    assert str(calls[1].url) == "https://gw.test/api/directory/v1/me/context"


async def test_company_display_name_from_directory(client, gateway, db_session):
    from app.models.company import Company

    await client.get("/api/v1/me", headers={"X-Ashfield-Session-ID": "sid-names"})
    company = await db_session.get(Company, "acme-corp")
    assert company is not None and company.name == "ACME 주식회사"


async def test_directory_down_is_503_not_empty_membership(client, gateway):
    """빈 목록으로 바꾸면 사용자가 "접근 권한 없음" 으로 튕긴다."""
    _, state = gateway
    state["directory_status"] = 502
    r = await client.get("/api/v1/me", headers={"X-Ashfield-Session-ID": "sid-directory-down"})
    assert r.status_code == 503


@pytest.mark.asyncio
async def test_session_lookup_is_cached(client, gateway):
    calls, _ = gateway
    for _ in range(2):
        res = await client.get("/api/v1/me", headers={"X-Ashfield-Session-ID": "sid-2"})
        assert res.status_code == 200
    assert len(calls) == 2  # /auth/me + 외부 디렉터리 소속, 두 번째 요청은 캐시


@pytest.mark.asyncio
async def test_dead_session_is_401(client, gateway):
    _, state = gateway
    state["status"] = 401
    res = await client.get("/api/v1/me", headers={"X-Ashfield-Session-ID": "dead"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_gateway_down_is_503_not_401(client, gateway):
    """401 이면 프론트가 로그인으로 튕기고 그 로그인도 실패해 무한 왕복이 된다."""
    _, state = gateway
    state["raise"] = True
    res = await client.get("/api/v1/me", headers={"X-Ashfield-Session-ID": "sid-3"})
    assert res.status_code == 503


@pytest.mark.asyncio
async def test_bearer_wins_over_session(client, gateway, auth_headers):
    calls, _ = gateway
    headers = {**auth_headers("alice", groups=["beta-co"]), "X-Ashfield-Session-ID": "sid-4"}
    res = await client.get("/api/v1/me", headers=headers)
    assert res.status_code == 200
    assert res.json()["sub"] == "alice"
    # 게이트웨이엔 안 물었다 (JWKS 공개키 조회는 같은 httpx 패치에 잡힐 수 있어 제외)
    assert [c for c in calls if c.url.host == "gw.test"] == []


def test_directory_target_follows_credential(monkeypatch):
    """Bearer 면 외부 디렉터리 직접, 세션만 있으면 게이트웨이 경유, 둘 다 없으면 401."""
    monkeypatch.setattr(settings, "directory_url", "https://directory.test")
    monkeypatch.setattr(settings, "gateway_url", "https://gw.test")
    base = dict(sub="u", email="u@test.local", name=None, groups=[], roles=[], sid=None)

    url, headers = external_directory._target("method/m.x", UserContext(**base, access_token="tok"))
    assert url == "https://directory.test/api/method/m.x"
    assert headers == {"Authorization": "Bearer tok"}

    url, headers = external_directory._target("method/m.x", UserContext(**base, session_id="sid"))
    assert url == "https://gw.test/api/directory/method/m.x"
    assert headers == {"X-Ashfield-Session-ID": "sid"}

    with pytest.raises(Exception) as exc:
        external_directory._target("method/m.x", UserContext(**base))
    assert getattr(exc.value, "status_code", None) == 401


async def test_list_departments_uses_rest_directory(monkeypatch):
    """회사 단위 REST 디렉터리를 부르고, 한글 회사 ID 는 percent-encode 한다."""
    monkeypatch.setattr(settings, "gateway_url", "https://gw.test")
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"items": [{"department_id": "D1", "department": "개발팀"}]})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        external_directory.httpx,
        "AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw),
    )
    base = dict(sub="u", email="u@test.local", name=None, groups=[], roles=[], sid=None)
    items = await external_directory.list_departments(
        UserContext(**base, session_id="sid"), "한글회사"
    )
    assert items == [{"department_id": "D1", "department": "개발팀"}]
    assert seen[0].url.raw_path.decode().startswith("/api/directory/v1/companies/%ED%95%9C%EA%B8%80%ED%9A%8C%EC%82%AC")
    assert seen[0].url.raw_path.decode().endswith("/directory/departments")
