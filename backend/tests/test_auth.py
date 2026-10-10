"""계정 서버 액세스 토큰 인증 + 로컬 사용자·워크스페이스 동기화 (ADR-0024, ADR-0004)."""

import asyncio
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

import app.auth.jwks as jwks_mod
from app.auth.provisioning import Identity, Workspace, provision_user
from app.core.config import settings
from app.models.company import Company
from app.models.user import User
from app.models.user_company_membership import UserCompanyMembership
from tests.conftest import (
    OTHER_PRIVATE_PEM,
    TEST_AUDIENCE,
    TEST_ISSUER,
    _make_rsa_key,
    mint_jwt,
    test_engine,
    ws,
)

_real_fetch_jwks = jwks_mod._fetch_jwks


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# 토큰 검증 실패 → 401 / 설정 문제 → 503
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_missing_token_401(client):
    res = await client.get("/api/v1/me")
    assert res.status_code == 401
    assert res.headers.get("www-authenticate") == "Bearer"


@pytest.mark.asyncio
async def test_non_bearer_scheme_401(client):
    res = await client.get("/api/v1/me", headers={"Authorization": "Basic Zm9vOmJhcg=="})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_garbage_token_401(client):
    res = await client.get("/api/v1/me", headers=bearer("not-a-jwt"))
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_expired_token_401(client):
    token = mint_jwt("exp-user", seed=False, exp_delta=-120)  # 허용 오차(60초) 밖
    res = await client.get("/api/v1/me", headers=bearer(token))
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_wrong_issuer_401(client):
    token = mint_jwt("iss-user", seed=False, iss="http://evil.test")
    res = await client.get("/api/v1/me", headers=bearer(token))
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_wrong_audience_401(client):
    token = mint_jwt("aud-user", seed=False, aud="http://other-app.test")
    res = await client.get("/api/v1/me", headers=bearer(token))
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_unknown_signing_key_401(client, test_jwks):
    """JWKS 에 없는 키로 서명: kid 미스 → JWKS 한 번 재조회 후에도 실패 → 401."""
    token = mint_jwt("forger", seed=False, private_pem=OTHER_PRIVATE_PEM, kid="other-key")
    res = await client.get("/api/v1/me", headers=bearer(token))
    assert res.status_code == 401
    assert len(test_jwks["calls"]) == 2  # 최초 + 무효화 후 재조회


@pytest.mark.asyncio
async def test_forged_signature_with_known_kid_401(client):
    """kid 는 맞지만 다른 개인키로 서명 → 서명 불일치 401."""
    token = mint_jwt("forger2", seed=False, private_pem=OTHER_PRIVATE_PEM)
    res = await client.get("/api/v1/me", headers=bearer(token))
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_key_rotation_refetches_jwks(client, test_jwks):
    """새 kid 토큰 → 캐시 무효화 후 재조회로 새 키를 받아 통과."""
    await client.get("/api/v1/me", headers=bearer(mint_jwt("rot-user", seed=False)))
    new_pem, new_jwk = _make_rsa_key("rotated-key")
    test_jwks["keys"].append(new_jwk)
    token = mint_jwt("rot-user", seed=False, private_pem=new_pem, kid="rotated-key")
    res = await client.get("/api/v1/me", headers=bearer(token))
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_jwks_unavailable_503(client, test_jwks):
    test_jwks["keys"].clear()
    res = await client.get("/api/v1/me", headers=bearer(mint_jwt("u", seed=False)))
    assert res.status_code == 503


@pytest.mark.asyncio
async def test_issuer_not_configured_503(client, monkeypatch):
    """iss/aud 설정이 비면 검증을 건너뛰지 않고 거부한다."""
    monkeypatch.setattr(settings, "auth_issuer", "")
    res = await client.get("/api/v1/me", headers=bearer(mint_jwt("u", seed=False)))
    assert res.status_code == 503


# ---------------------------------------------------------------------------
# 사용자 upsert
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_first_request_upserts_user(client, db_session):
    token = mint_jwt(
        "ba-user-1",
        seed=False,
        email="first@example.com",
        name="처음",
        image="https://img.example.com/a.png",
    )
    res = await client.get("/api/v1/me", headers=bearer(token))
    assert res.status_code == 200
    body = res.json()
    assert body["sub"] == "ba-user-1"
    assert body["email"] == "first@example.com"
    assert body["image"] == "https://img.example.com/a.png"

    user = await db_session.get(User, "ba-user-1")
    assert user is not None
    assert (user.email, user.name, user.image) == (
        "first@example.com",
        "처음",
        "https://img.example.com/a.png",
    )
    assert user.is_system_admin is False


@pytest.mark.asyncio
async def test_profile_change_updates_user(client, db_session):
    await client.get(
        "/api/v1/me",
        headers=bearer(mint_jwt("ba-user-2", seed=False, email="a@example.com", name="A")),
    )
    await client.get(
        "/api/v1/me",
        headers=bearer(mint_jwt("ba-user-2", seed=False, email="b@example.com", name="B")),
    )
    user = await db_session.get(User, "ba-user-2", populate_existing=True)
    assert (user.email, user.name) == ("b@example.com", "B")
    count = await db_session.scalar(select(func.count()).where(User.id == "ba-user-2"))
    assert count == 1


# ---------------------------------------------------------------------------
# 계약 모양 (aud 배열 · iss · picture)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_audience_array_containing_app_accepted(client):
    """aud 는 배열: 이 앱 resource 가 들어 있으면 통과 (userinfo URL 등 다른 값은 무시)."""
    token = mint_jwt("aud-arr", seed=False, aud=["http://other.test", TEST_AUDIENCE])
    assert (await client.get("/api/v1/me", headers=bearer(token))).status_code == 200


@pytest.mark.asyncio
async def test_audience_array_without_app_401(client):
    """다른 앱(Drive 등)용 토큰: aud 배열에 이 앱이 없으면 401."""
    token = mint_jwt(
        "aud-other",
        seed=False,
        aud=["http://drive.test", f"{TEST_ISSUER}/api/auth/oauth2/userinfo"],
    )
    assert (await client.get("/api/v1/me", headers=bearer(token))).status_code == 401


@pytest.mark.asyncio
async def test_issuer_with_trailing_slash_401(client):
    """iss 는 ACCOUNT_URL 과 정확히 일치해야 한다."""
    token = mint_jwt("iss-slash", seed=False, iss=f"{TEST_ISSUER}/")
    assert (await client.get("/api/v1/me", headers=bearer(token))).status_code == 401


@pytest.mark.asyncio
async def test_small_clock_skew_tolerated(client):
    """만료 직후(60초 이내)는 시계 오차로 허용, 그 이상은 401."""
    ok = mint_jwt("skew", seed=False, exp_delta=-30)
    assert (await client.get("/api/v1/me", headers=bearer(ok))).status_code == 200
    late = mint_jwt("skew", seed=False, exp_delta=-120)
    assert (await client.get("/api/v1/me", headers=bearer(late))).status_code == 401


# ---------------------------------------------------------------------------
# workspaces 클레임 → 로컬 회사·멤버십 동기화
# ---------------------------------------------------------------------------


async def _memberships(db: AsyncSession, sub: str) -> dict[str, str]:
    rows = (
        await db.execute(
            select(UserCompanyMembership.company_id, UserCompanyMembership.role).where(
                UserCompanyMembership.user_sub == sub
            )
        )
    ).all()
    return dict(rows)


@pytest.mark.asyncio
async def test_workspaces_claim_creates_companies_and_memberships(client, db_session):
    token = mint_jwt(
        "acc-user-1",
        seed=False,
        name="홍길동",
        workspaces=[
            ws("wsPersonal1", "owner", "홍길동의 워크스페이스"),
            ws("wsTeamA", "admin", "팀 A"),
            ws("wsTeamB", "member", "팀 B"),
        ],
    )
    body = (await client.get("/api/v1/me", headers=bearer(token))).json()

    assert sorted(body["groups"]) == ["wsPersonal1", "wsTeamA", "wsTeamB"]
    assert body["company_roles"] == {
        "wsPersonal1": "admin",  # owner → admin
        "wsTeamA": "admin",
        "wsTeamB": "member",
    }
    names = {c["id"]: (c["name"], c["account_workspace_id"]) for c in body["companies"]}
    assert names["wsTeamA"] == ("팀 A", "wsTeamA")
    assert names["wsPersonal1"] == ("홍길동의 워크스페이스", "wsPersonal1")

    company = await db_session.get(Company, "wsTeamB")
    assert company is not None and company.account_workspace_id == "wsTeamB"

    # 활성 회사로 실제 도메인 API 사용 가능, 클레임에 없는 회사는 403
    res = await client.get(
        "/api/v1/me/company/members", headers={**bearer(token), "X-Active-Company-Id": "wsTeamB"}
    )
    assert res.status_code == 200
    res = await client.get(
        "/api/v1/me/company/members",
        headers={**bearer(token), "X-Active-Company-Id": "someone-else"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_no_personal_company_auto_created(client, db_session):
    """개인 워크스페이스는 계정 서버가 만든다: 앱은 소속 없는 사용자에게 회사를 만들지 않는다."""
    token = mint_jwt("acc-empty", seed=False, workspaces=[])
    body = (await client.get("/api/v1/me", headers=bearer(token))).json()
    assert body["groups"] == []
    assert await _memberships(db_session, "acc-empty") == {}


@pytest.mark.asyncio
async def test_workspace_role_change_applied(client, db_session):
    await client.get(
        "/api/v1/me",
        headers=bearer(mint_jwt("acc-role", seed=False, workspaces=[ws("wsRole", "member")])),
    )
    assert await _memberships(db_session, "acc-role") == {"wsRole": "member"}

    await client.get(
        "/api/v1/me",
        headers=bearer(mint_jwt("acc-role", seed=False, workspaces=[ws("wsRole", "admin")])),
    )
    assert await _memberships(db_session, "acc-role") == {"wsRole": "admin"}

    await client.get(
        "/api/v1/me",
        headers=bearer(mint_jwt("acc-role", seed=False, workspaces=[ws("wsRole", "owner")])),
    )
    assert await _memberships(db_session, "acc-role") == {"wsRole": "admin"}


@pytest.mark.asyncio
async def test_workspace_removed_from_claim_drops_membership(client, db_session):
    both = [ws("wsKeep", "member"), ws("wsLeave", "member")]
    await client.get("/api/v1/me", headers=bearer(mint_jwt("acc-rm", seed=False, workspaces=both)))
    assert set(await _memberships(db_session, "acc-rm")) == {"wsKeep", "wsLeave"}

    token = mint_jwt("acc-rm", seed=False, workspaces=[ws("wsKeep", "member")])
    body = (await client.get("/api/v1/me", headers=bearer(token))).json()
    assert body["groups"] == ["wsKeep"]
    assert await _memberships(db_session, "acc-rm") == {"wsKeep": "member"}
    # 회사 행 자체는 남는다 (다른 멤버·데이터가 있을 수 있음)
    assert await db_session.get(Company, "wsLeave") is not None

    res = await client.get(
        "/api/v1/me/company/members", headers={**bearer(token), "X-Active-Company-Id": "wsLeave"}
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_workspace_rename_updates_company(client, db_session):
    await client.get(
        "/api/v1/me",
        headers=bearer(mint_jwt("acc-ren", seed=False, workspaces=[ws("wsRen", name="옛 이름")])),
    )
    body = (
        await client.get(
            "/api/v1/me",
            headers=bearer(
                mint_jwt("acc-ren", seed=False, workspaces=[ws("wsRen", name="새 이름")])
            ),
        )
    ).json()
    assert body["companies"] == [{"id": "wsRen", "name": "새 이름", "account_workspace_id": "wsRen"}]


@pytest.mark.asyncio
async def test_legacy_local_memberships_untouched(client, auth_headers, db_session):
    """계정 서버 도입 전 로컬 회사(account_workspace_id NULL) 멤버십은 동기화가 지우지 않는다."""
    await client.get("/api/v1/me", headers=auth_headers("acc-legacy", groups=["legacy-co"]))
    token = mint_jwt("acc-legacy", seed=False, workspaces=[ws("wsNew", "owner")])
    body = (await client.get("/api/v1/me", headers=bearer(token))).json()
    assert sorted(body["groups"]) == ["legacy-co", "wsNew"]


@pytest.mark.asyncio
async def test_existing_company_linked_by_account_workspace_id(client, db_session):
    """운영자가 레거시 회사에 account_workspace_id 를 채워 두면 그 회사(로컬 id)로 연결된다."""
    db_session.add(Company(id="acme-legacy", name="Acme", account_workspace_id="wsAcme"))
    await db_session.flush()
    token = mint_jwt("acc-link", seed=False, workspaces=[ws("wsAcme", "admin", "Acme")])
    body = (await client.get("/api/v1/me", headers=bearer(token))).json()
    assert body["groups"] == ["acme-legacy"]
    assert body["company_roles"] == {"acme-legacy": "admin"}
    assert await db_session.get(Company, "wsAcme") is None


@pytest.mark.asyncio
async def test_unchanged_claim_skips_sync(client, db_session, monkeypatch):
    """클레임 해시가 지난번과 같으면 동기화(쓰기)를 건너뛴다: 보통의 요청은 SELECT 만."""
    import app.auth.provisioning as prov

    calls: list[str] = []
    real_sync = prov.sync_workspaces

    async def counting_sync(db, sub, workspaces):
        calls.append(sub)
        await real_sync(db, sub, workspaces)

    monkeypatch.setattr(prov, "sync_workspaces", counting_sync)

    claim = [ws("wsCache", "member"), ws("wsCache2", "admin")]
    for _ in range(3):
        token = mint_jwt("acc-cache", seed=False, workspaces=claim)
        assert (await client.get("/api/v1/me", headers=bearer(token))).status_code == 200
    assert calls == ["acc-cache"]

    # 순서만 다른 같은 클레임도 같은 해시
    token = mint_jwt("acc-cache", seed=False, workspaces=list(reversed(claim)))
    await client.get("/api/v1/me", headers=bearer(token))
    assert calls == ["acc-cache"]

    # 바뀌면 다시 동기화
    token = mint_jwt("acc-cache", seed=False, workspaces=[ws("wsCache", "admin")])
    await client.get("/api/v1/me", headers=bearer(token))
    assert calls == ["acc-cache", "acc-cache"]
    user = await db_session.get(User, "acc-cache", populate_existing=True)
    assert user.workspaces_claim_hash is not None


@pytest.mark.asyncio
async def test_token_without_workspaces_claim_keeps_memberships(client, db_session):
    """클레임이 아예 없으면(계정 서버 토큰이 아님) 소속을 건드리지 않는다."""
    await client.get(
        "/api/v1/me",
        headers=bearer(mint_jwt("acc-noclaim", seed=False, workspaces=[ws("wsStay")])),
    )
    body = (
        await client.get("/api/v1/me", headers=bearer(mint_jwt("acc-noclaim", seed=False)))
    ).json()
    assert body["groups"] == ["wsStay"]


@pytest.mark.asyncio
async def test_malformed_workspace_entries_ignored(client, db_session):
    token = mint_jwt(
        "acc-bad",
        seed=False,
        workspaces=[ws("wsGood", "superuser"), {"name": "id 없음"}, "not-a-dict", {"id": ""}],
    )
    body = (await client.get("/api/v1/me", headers=bearer(token))).json()
    # 모르는 역할은 최소 권한(member)
    assert body["company_roles"] == {"wsGood": "member"}


@pytest.mark.asyncio
async def test_concurrent_first_sync_race_safe():
    """같은 사용자의 동시 첫 요청: 별개 트랜잭션들이 동시에 동기화해도 회사·멤버십은 하나씩."""
    sub = f"race-{uuid4().hex[:12]}"
    wsid = f"wsRace{uuid4().hex[:8]}"
    ident = Identity(
        sub=sub,
        email=f"{sub}@test.local",
        name="경합",
        image=None,
        workspaces=(Workspace(id=wsid, name="경합 팀", role="admin"),),
    )

    async def first_request() -> list[str]:
        async with AsyncSession(bind=test_engine, expire_on_commit=False) as s:
            async with s.begin():
                return (await provision_user(s, ident)).company_ids

    try:
        results = await asyncio.gather(first_request(), first_request(), first_request())
        assert results == [[wsid], [wsid], [wsid]]
        async with AsyncSession(bind=test_engine) as s:
            assert await s.scalar(select(func.count()).where(Company.id == wsid)) == 1
            assert (
                await s.scalar(
                    select(func.count()).where(UserCompanyMembership.user_sub == sub)
                )
                == 1
            )
    finally:
        async with AsyncSession(bind=test_engine) as s:
            async with s.begin():
                await s.execute(
                    delete(UserCompanyMembership).where(UserCompanyMembership.user_sub == sub)
                )
                await s.execute(delete(Company).where(Company.id == wsid))
                await s.execute(delete(User).where(User.id == sub))


# ---------------------------------------------------------------------------
# SYSTEM_ADMIN_EMAILS
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_system_admin_emails(client, monkeypatch):
    monkeypatch.setattr(settings, "system_admin_emails", "root@example.com")
    token = mint_jwt("ba-root", seed=False, email="root@example.com")
    body = (await client.get("/api/v1/me", headers=bearer(token))).json()
    assert body["is_system_admin"] is True
    res = await client.get("/api/v1/admin/companies", headers=bearer(token))
    assert res.status_code == 200

    other = mint_jwt("ba-plain", seed=False, email="plain@example.com")
    assert (await client.get("/api/v1/admin/companies", headers=bearer(other))).status_code == 403


@pytest.mark.asyncio
async def test_system_admin_flag_from_db(client, db_session):
    token = mint_jwt("ba-flag", seed=False)
    await client.get("/api/v1/me", headers=bearer(token))
    user = await db_session.get(User, "ba-flag")
    user.is_system_admin = True
    await db_session.flush()
    body = (await client.get("/api/v1/me", headers=bearer(token))).json()
    assert body["is_system_admin"] is True


@pytest.mark.asyncio
async def test_unknown_kid_refetch_is_rate_limited(client, test_jwks):
    """위조 토큰이 몰려도 JWKS 재조회는 간격 제한 안에서 한 번뿐."""
    token = mint_jwt("forger3", seed=False, private_pem=OTHER_PRIVATE_PEM, kid="other-key")
    for _ in range(5):
        assert (await client.get("/api/v1/me", headers=bearer(token))).status_code == 401
    assert len(test_jwks["calls"]) == 2


@pytest.mark.asyncio
async def test_jwks_http_fetch(client, monkeypatch):
    """실제 httpx 경로: AUTH_JWKS_URL 에서 {"keys": [...]} 를 읽고, 실패하면 503."""
    from tests.conftest import TEST_PUBLIC_JWK

    state = {"status": 200}
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(state["status"], json={"keys": [TEST_PUBLIC_JWK]})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(jwks_mod, "_fetch_jwks", _real_fetch_jwks)
    monkeypatch.setattr(
        jwks_mod.httpx,
        "AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw),
    )

    token = mint_jwt("http-user", seed=False)
    assert (await client.get("/api/v1/me", headers=bearer(token))).status_code == 200
    assert seen == [settings.auth_jwks_url]

    jwks_mod.invalidate_jwks_cache()
    state["status"] = 500
    assert (await client.get("/api/v1/me", headers=bearer(token))).status_code == 503
