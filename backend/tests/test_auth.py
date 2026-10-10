"""Better Auth JWT 인증 + 로컬 사용자·개인 워크스페이스 준비 (ADR-0023, ADR-0004)."""

import asyncio
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

import app.auth.jwks as jwks_mod
from app.auth.provisioning import (
    Identity,
    ensure_personal_company,
    personal_company_id,
)
from app.core.config import settings
from app.models.company import Company
from app.models.user import User
from app.models.user_company_membership import UserCompanyMembership
from tests.conftest import (
    OTHER_PRIVATE_PEM,
    _make_rsa_key,
    mint_jwt,
    test_engine,
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
    token = mint_jwt("exp-user", seed=False, exp_delta=-60)
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
    """JWKS 에 없는 키로 서명 — kid 미스 → JWKS 한 번 재조회 후에도 실패 → 401."""
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
# 개인 워크스페이스 자동 생성
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_personal_company_created_on_first_login(client, db_session):
    token = mint_jwt("ba-user-3", seed=False, name="홍길동")
    body = (await client.get("/api/v1/me", headers=bearer(token))).json()

    cid = personal_company_id("ba-user-3")
    assert body["groups"] == [cid]
    assert body["companies"] == [{"id": cid, "name": "홍길동의 워크스페이스"}]
    assert body["company_roles"] == {cid: "admin"}

    # 활성 회사로 실제 도메인 API 사용 가능
    res = await client.get(
        "/api/v1/me/company/members", headers={**bearer(token), "X-Active-Company-Id": cid}
    )
    assert res.status_code == 200
    # 다른 회사는 403
    res = await client.get(
        "/api/v1/me/company/members",
        headers={**bearer(token), "X-Active-Company-Id": "someone-else"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_personal_company_idempotent(client, db_session):
    token = mint_jwt("ba-user-4", seed=False)
    for _ in range(3):
        assert (await client.get("/api/v1/me", headers=bearer(token))).status_code == 200

    companies = await db_session.scalar(
        select(func.count()).where(Company.id == personal_company_id("ba-user-4"))
    )
    memberships = await db_session.scalar(
        select(func.count()).where(UserCompanyMembership.user_sub == "ba-user-4")
    )
    assert companies == 1
    assert memberships == 1


@pytest.mark.asyncio
async def test_existing_membership_skips_personal_company(client, auth_headers, db_session):
    h = auth_headers("ba-user-5", groups=["acme-corp"])
    body = (await client.get("/api/v1/me", headers=h)).json()
    assert body["groups"] == ["acme-corp"]
    assert await db_session.get(Company, personal_company_id("ba-user-5")) is None


@pytest.mark.asyncio
async def test_personal_company_race_safe():
    """같은 사용자의 동시 첫 요청 — 별개 트랜잭션 둘이 동시에 만들어도 하나만 남는다."""
    sub = f"race-{uuid4().hex[:12]}"
    ident = Identity(sub=sub, email=f"{sub}@test.local", name="경합", image=None)
    cid = personal_company_id(sub)

    async def first_login() -> str:
        async with AsyncSession(bind=test_engine, expire_on_commit=False) as s:
            async with s.begin():
                await s.execute(_user_upsert(sub, ident.email))
                return await ensure_personal_company(s, ident)

    try:
        results = await asyncio.gather(first_login(), first_login(), first_login())
        assert results == [cid, cid, cid]
        async with AsyncSession(bind=test_engine) as s:
            assert await s.scalar(select(func.count()).where(Company.id == cid)) == 1
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
                await s.execute(delete(Company).where(Company.id == cid))
                await s.execute(delete(User).where(User.id == sub))


def _user_upsert(sub: str, email: str):
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    return (
        pg_insert(User)
        .values(id=sub, email=email, name="경합")
        .on_conflict_do_nothing(index_elements=[User.id])
    )


# ---------------------------------------------------------------------------
# ALLOWED_EMAILS / SYSTEM_ADMIN_EMAILS
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_allowed_emails_rejects_others(client, monkeypatch, db_session):
    monkeypatch.setattr(settings, "allowed_emails", "ok@example.com, Boss@Example.com")

    denied = mint_jwt("ba-deny", seed=False, email="stranger@example.com")
    res = await client.get("/api/v1/me", headers=bearer(denied))
    assert res.status_code == 403
    # 거부된 사용자는 로컬 행도 생기지 않는다
    assert await db_session.get(User, "ba-deny") is None

    ok = mint_jwt("ba-ok", seed=False, email="OK@example.com")  # 대소문자 무시
    assert (await client.get("/api/v1/me", headers=bearer(ok))).status_code == 200
    boss = mint_jwt("ba-boss", seed=False, email="boss@example.com")
    assert (await client.get("/api/v1/me", headers=bearer(boss))).status_code == 200


@pytest.mark.asyncio
async def test_allowed_emails_empty_allows_anyone(client, monkeypatch):
    monkeypatch.setattr(settings, "allowed_emails", "")
    token = mint_jwt("ba-anyone", seed=False, email="anyone@anywhere.test")
    assert (await client.get("/api/v1/me", headers=bearer(token))).status_code == 200


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
