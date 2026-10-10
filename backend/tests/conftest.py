"""
pytest 공통 fixtures.

전략:
  - 테스트 전용 DB(ashfield_drive_test): 동일 컨테이너의 별도 DB
  - 각 테스트는 자기 트랜잭션 안에서 실행 → 끝나면 롤백 (테스트 간 격리)
  - 인증은 mocking 없이 진짜 JWT: Ashfield 계정 서버 액세스 토큰과 같은 모양(RS256, typ at+jwt,
    iss, aud 배열, picture, workspaces)으로 테스트 프로세스가 만든 RSA 키로 서명 → validator·소속
    동기화 코드 경로 동일. JWKS 는 네트워크 대신 그 키의 공개 JWK 를 돌려주도록 `_fetch_jwks` 만 바꾼다.
  - `workspaces=[...]` 는 실제 클레임 → 운영 코드(provisioning.sync_workspaces)가 워크스페이스·멤버십을 맞춘다.
  - `groups=[...]`·`roles=[...]` 는 테스트 전용 `_test_seed` claim: 계정 서버 도입 전의 로컬(레거시)
    워크스페이스 멤버십·System Admin 을 테스트 transport 가 요청 직전에 DB 에 심는다. 운영 코드는 이 claim 을
    모른다. 도메인 테스트 대부분이 이 경로로 활성 워크스페이스를 준비한다.
"""

from __future__ import annotations

import os

# 인증 설정은 app.core.config(settings 로드) import 전에 고정한다: 개발 .env 값과 무관하게
# 테스트 issuer/audience 로 검증. 이 테스트 프로세스의 env 에만 영향.
os.environ["AUTH_JWKS_URL"] = "http://account.test/api/auth/jwks"
os.environ["AUTH_ISSUER"] = "http://account.test"
os.environ["AUTH_AUDIENCE"] = "http://app.test"
os.environ["SYSTEM_ADMIN_EMAILS"] = ""

import base64
import time
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import ASGITransport, AsyncClient
from jose import jwt
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings
from app.core.db import get_db
from app.main import app
from app.models import Base
from app.models.user import User
from app.models.user_workspace_membership import UserWorkspaceMembership
from app.models.workspace import Workspace

# ---------------------------------------------------------------------------
# 테스트 서명 키: 프로세스마다 새로 만든다 (저장소에 개인키를 두지 않음)
# ---------------------------------------------------------------------------

TEST_ISSUER = os.environ["AUTH_ISSUER"]
TEST_AUDIENCE = os.environ["AUTH_AUDIENCE"]
# openid scope 토큰엔 userinfo URL 도 aud 에 들어간다 (계약 §5): 무시돼야 한다.
TEST_USERINFO_AUD = f"{TEST_ISSUER}/api/auth/oauth2/userinfo"
TEST_KID = "test-key-1"


def _b64url_uint(value: int) -> str:
    raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _make_rsa_key(kid: str) -> tuple[str, dict]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    pub = key.public_key().public_numbers()
    jwk = {
        "kty": "RSA",
        "use": "sig",
        "alg": "RS256",
        "kid": kid,
        "n": _b64url_uint(pub.n),
        "e": _b64url_uint(pub.e),
    }
    return pem, jwk


TEST_PRIVATE_PEM, TEST_PUBLIC_JWK = _make_rsa_key(TEST_KID)
# 서명은 맞지만 JWKS 에 없는 키: 위조 토큰 테스트용
OTHER_PRIVATE_PEM, _ = _make_rsa_key("other-key")

# ---------------------------------------------------------------------------
# DB 셋업: 테스트 전용 별도 DB
# ---------------------------------------------------------------------------

TEST_DB_URL = settings.database_url.replace(
    "/ashfield_drive", "/ashfield_drive_test"
)
_TEST_DB_NAME = "ashfield_drive_test"

test_engine = create_async_engine(TEST_DB_URL, pool_pre_ping=True)
TestSessionLocal = async_sessionmaker(
    bind=test_engine, expire_on_commit=False, class_=AsyncSession
)


@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def _setup_test_db():
    """세션 전체 한 번: 테스트 DB 스키마 생성·삭제."""
    # DB 자체는 사전에 docker-compose의 postgres가 띄워져 있어야 함.
    # CREATE DATABASE는 별도 sync 커넥션으로.
    import asyncpg

    base_url = settings.database_url.replace(
        "postgresql+asyncpg://", "postgresql://"
    )
    server_dsn, _ = base_url.rsplit("/", 1)

    conn = await asyncpg.connect(f"{server_dsn}/postgres")
    try:
        exists = await conn.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", _TEST_DB_NAME
        )
        if not exists:
            await conn.execute(f'CREATE DATABASE "{_TEST_DB_NAME}"')
    finally:
        await conn.close()

    # 스키마 생성
    async with test_engine.begin() as engine_conn:
        await engine_conn.run_sync(Base.metadata.create_all)

    yield

    await test_engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def _clear_redis_per_test():
    """매 테스트 시작 시 Redis rate limit 키 비움.

    싱글톤은 session loop 안에서 살아있으므로 리셋 안 함.
    사용 후 키만 청소: 테스트 간 격리.
    """
    from app.core.redis import get_redis

    redis = get_redis()
    for prefix in ("rl:public:*",):
        keys = await redis.keys(prefix)
        if keys:
            await redis.delete(*keys)
    yield


@pytest.fixture(autouse=True)
def test_jwks(monkeypatch):
    """JWKS 조회를 네트워크 대신 테스트 공개키로. 리스트를 바꾸면 키 회전 흉내."""
    import app.auth.jwks as jwks_mod

    keys = [TEST_PUBLIC_JWK]
    calls: list[str] = []

    async def fake_fetch(url: str) -> list[dict]:
        calls.append(url)
        return list(keys)

    monkeypatch.setattr(jwks_mod, "_fetch_jwks", fake_fetch)
    jwks_mod.invalidate_jwks_cache()
    yield {"keys": keys, "calls": calls}
    jwks_mod.invalidate_jwks_cache()


async def _apply_test_seed(db: AsyncSession, authorization: str | None) -> None:
    """테스트 토큰의 `_test_seed`(groups·roles)를 로컬 DB 에 반영.

    예전 IdP groups 클레임 시맨틱을 테스트에서 재현: 사용자 행을 만들고, 소속을 정확히
    groups 로 맞추며(role 은 보존), roles 에 admin 이 있으면 System Admin.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return
    try:
        claims = jwt.get_unverified_claims(authorization.split(" ", 1)[1])
    except Exception:
        return
    seed = claims.get("_test_seed")
    if not isinstance(seed, dict) or not claims.get("sub"):
        return
    sub = claims["sub"]
    groups: list[str] = list(seed.get("groups") or [])
    is_admin = "admin" in (seed.get("roles") or [])
    await db.execute(
        pg_insert(User)
        .values(id=sub, email=claims.get("email", ""), name=claims.get("name"),
                is_system_admin=is_admin)
        .on_conflict_do_update(
            index_elements=[User.id], set_={"is_system_admin": is_admin}
        )
    )
    for g in groups:
        await db.execute(
            pg_insert(Workspace).values(id=g, name=g).on_conflict_do_nothing()
        )
        await db.execute(
            pg_insert(UserWorkspaceMembership)
            .values(user_sub=sub, workspace_id=g)
            .on_conflict_do_nothing()
        )
    cond = [UserWorkspaceMembership.user_sub == sub]
    if groups:
        cond.append(UserWorkspaceMembership.workspace_id.notin_(groups))
    await db.execute(delete(UserWorkspaceMembership).where(*cond))
    await db.flush()


class _SeedingTransport(ASGITransport):
    def __init__(self, *, db: AsyncSession, **kw):
        super().__init__(**kw)
        self._db = db

    async def handle_async_request(self, request):
        await _apply_test_seed(self._db, request.headers.get("authorization"))
        return await super().handle_async_request(request)


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    """테스트마다 새 트랜잭션: 끝나면 롤백.

    join_transaction_mode="create_savepoint": 코드가 commit() 해도(배경 dispatch 의
    send_notification_email / webhook deliver_one) savepoint release 라 바깥 트랜잭션이
    유지된다. 없으면 inner commit 이 outer 를 닫아 "transaction is closed" 로 깨짐.
    """
    async with test_engine.connect() as connection:
        trans = await connection.begin()
        session = AsyncSession(
            bind=connection,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        try:
            yield session
        finally:
            await session.close()
            await trans.rollback()


# ---------------------------------------------------------------------------
# HTTP client: get_db override해서 트랜잭션 공유
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def client(db_session: AsyncSession, monkeypatch) -> AsyncIterator[AsyncClient]:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    # Webhook dispatcher 의 백그라운드 세션이 테스트 트랜잭션을 못 보는 문제 회피:
    # _deliver_one 이 호출하는 AsyncSessionLocal() 을: context manager 진입 시 db_session 을
    # 반환하고 종료 시 아무것도 안 하는 stub 으로 대체. 실제 commit 은 outer rollback 으로 무효화.
    import contextlib

    @contextlib.asynccontextmanager
    async def fake_factory():
        try:
            yield db_session
        finally:
            pass

    import app.services.notifications as notif_mod
    import app.services.webhooks as wh

    monkeypatch.setattr(wh, "AsyncSessionLocal", fake_factory)
    # 배경 email 발송(send_notification_email)도 테스트 트랜잭션을 보게 (#2).
    monkeypatch.setattr(notif_mod, "AsyncSessionLocal", fake_factory)

    # 배경 dispatch 를 테스트에선 동기(await)로: create_task 가 공유 db_session 을
    # 동시 사용/commit 해 IllegalStateChange·ResourceClosed 로 flaky 하던 것 제거.
    # (운영은 그대로 create_task; 각자 세션이라 문제 없음.)
    async def _sync_dispatch(delivery_ids: list[str]) -> None:
        for d_id in delivery_ids:
            await wh.deliver_one(d_id)

    async def _sync_fire(self) -> None:
        await _sync_dispatch(self.delivery_ids)
        for nid in self.notification_ids:
            await notif_mod.send_notification_email(nid)

    monkeypatch.setattr(wh, "dispatch_async", _sync_dispatch)
    monkeypatch.setattr(notif_mod.PendingDispatch, "fire", _sync_fire)

    transport = _SeedingTransport(app=app, db=db_session)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# JWT 발급 헬퍼: 테스트 키로 서명 (계정 서버 액세스 토큰과 같은 모양)
# ---------------------------------------------------------------------------


def ws(id: str, role: str = "member", name: str | None = None) -> dict:
    """`workspaces` 클레임 항목. role 은 계정 서버 값(owner|admin|member)."""
    return {"id": id, "name": name or id, "slug": id, "role": role}


def mint_jwt(
    sub: str,
    *,
    email: str | None = None,
    name: str | None = None,
    image: str | None = None,
    groups: list[str] | None = None,
    roles: list[str] | None = None,
    workspaces: list[dict] | None = None,
    seed: bool = True,
    exp_delta: int = 900,
    iss: str = TEST_ISSUER,
    aud: str | list[str] | None = None,
    private_pem: str = TEST_PRIVATE_PEM,
    kid: str = TEST_KID,
) -> str:
    """seed=True 면 `_test_seed` 로 groups·roles 를 DB 에 심는다 (테스트 transport, 레거시 워크스페이스).
    seed=False 는 실제 첫 로그인처럼 아무 소속 없이 들어오는 토큰.
    workspaces 를 주면 실제 `workspaces` 클레임으로 싣는다 (None 이면 클레임 없음)."""
    now = int(time.time())
    claims: dict = {
        "sub": sub,
        "email": email or f"{sub}@test.local",
        "email_verified": True,
        "name": name if name is not None else f"{sub} (test)",
        "picture": image,
        "iss": iss,
        "aud": aud if aud is not None else [TEST_AUDIENCE, TEST_USERINFO_AUD],
        "azp": "ashfield-test",
        "client_id": "ashfield-test",
        "scope": "openid profile email offline_access",
        "iat": now,
        "exp": now + exp_delta,
    }
    if workspaces is not None:
        claims["workspaces"] = workspaces
    if seed:
        claims["_test_seed"] = {"groups": groups or [], "roles": roles or []}
    return jwt.encode(
        claims, private_pem, algorithm="RS256", headers={"kid": kid, "typ": "at+jwt"}
    )


@pytest.fixture
def make_jwt():
    """make_jwt(sub, groups=[...], roles=[...], ...) → JWT 문자열."""
    return mint_jwt


@pytest.fixture
def mock_storage(monkeypatch):
    """S3 호출을 인메모리로 흉내: presign 은 가짜 URL, head 는 항상 성공."""
    state: dict[str, dict] = {}

    async def fake_ensure_bucket() -> None:
        return None

    async def fake_presign_put(storage_key: str, *, content_type: str | None = None) -> str:
        state[storage_key] = {"ContentLength": 123, "ETag": '"deadbeef"'}
        return f"http://mock-s3/put/{storage_key}"

    async def fake_presign_get(
        storage_key: str,
        *,
        download_name: str | None = None,
        inline: bool = False,
    ) -> str:
        return f"http://mock-s3/get/{storage_key}"

    async def fake_head_object(storage_key: str) -> dict | None:
        return state.get(storage_key)

    async def fake_delete_object(storage_key: str) -> None:
        state.pop(storage_key, None)

    async def fake_get_object_bytes(storage_key: str) -> bytes:
        return state.get(f"body:{storage_key}", b"FAKE_BYTES_" + storage_key.encode())

    async def fake_create_multipart(storage_key: str, *, content_type=None) -> str:  # noqa: ARG001
        state[f"mpu:{storage_key}"] = {"parts": {}}
        return f"upload-id-{storage_key}"

    async def fake_presign_part(storage_key: str, *, upload_id, part_number) -> str:  # noqa: ARG001
        return f"http://mock-s3/part/{storage_key}/{part_number}"

    async def fake_complete_multipart(storage_key: str, *, upload_id, parts) -> dict:  # noqa: ARG001
        # 완료 시 일반 object 로 변환: head 가 조회 가능하도록 등록
        size = sum(p.get("Size", 100) for p in parts) or 100 * len(parts)
        state[storage_key] = {"ContentLength": size, "ETag": '"composite-etag"'}
        state.pop(f"mpu:{storage_key}", None)
        return {"ETag": '"composite-etag"', "Location": f"http://mock-s3/{storage_key}"}

    async def fake_abort_multipart(storage_key: str, *, upload_id) -> None:  # noqa: ARG001
        state.pop(f"mpu:{storage_key}", None)

    # storage 모듈과 그 이름을 from-import 한 라우터들 모두 패치
    import app.api.external as external_mod
    import app.api.v1.file_versions as versions_api_mod
    import app.api.v1.nodes as nodes_mod
    import app.core.storage as storage_mod
    import app.services.file_versions as versions_mod
    import app.services.nodes as nodes_svc_mod
    import app.services.zip_export as zip_mod

    for mod in (
        storage_mod,
        nodes_mod,
        external_mod,
        zip_mod,
        versions_mod,
        versions_api_mod,
        nodes_svc_mod,
    ):
        if hasattr(mod, "presign_put"):
            monkeypatch.setattr(mod, "presign_put", fake_presign_put, raising=False)
        if hasattr(mod, "presign_get"):
            monkeypatch.setattr(mod, "presign_get", fake_presign_get, raising=False)
        if hasattr(mod, "head_object"):
            monkeypatch.setattr(mod, "head_object", fake_head_object, raising=False)
        if hasattr(mod, "delete_object"):
            monkeypatch.setattr(mod, "delete_object", fake_delete_object, raising=False)
        if hasattr(mod, "ensure_bucket"):
            monkeypatch.setattr(mod, "ensure_bucket", fake_ensure_bucket, raising=False)
        if hasattr(mod, "create_multipart_upload"):
            monkeypatch.setattr(
                mod, "create_multipart_upload", fake_create_multipart, raising=False
            )
        if hasattr(mod, "presign_upload_part"):
            monkeypatch.setattr(
                mod, "presign_upload_part", fake_presign_part, raising=False
            )
        if hasattr(mod, "complete_multipart_upload"):
            monkeypatch.setattr(
                mod,
                "complete_multipart_upload",
                fake_complete_multipart,
                raising=False,
            )
        if hasattr(mod, "abort_multipart_upload"):
            monkeypatch.setattr(
                mod, "abort_multipart_upload", fake_abort_multipart, raising=False
            )
        if hasattr(mod, "get_object_bytes"):
            monkeypatch.setattr(
                mod, "get_object_bytes", fake_get_object_bytes, raising=False
            )
    return state


@pytest.fixture
def auth_headers(make_jwt):
    """편의 헬퍼: auth_headers(sub, ...) → Authorization + X-Active-Workspace-Id."""

    def _headers(
        sub: str,
        *,
        groups: list[str] | None = None,
        roles: list[str] | None = None,
        active_workspace: str | None = None,
    ) -> dict[str, str]:
        token = make_jwt(sub, groups=groups, roles=roles)
        headers = {"Authorization": f"Bearer {token}"}
        if active_workspace:
            headers["X-Active-Workspace-Id"] = active_workspace
        return headers

    return _headers
