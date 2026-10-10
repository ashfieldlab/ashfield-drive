"""
pytest 공통 fixtures.

전략:
  - 테스트 전용 DB(ashfield_drive_test) — 동일 컨테이너의 별도 DB
  - 각 테스트는 자기 트랜잭션 안에서 실행 → 끝나면 롤백 (테스트 간 격리)
  - 인증은 mocking 없이 진짜 JWT 발급 (dev 키로 RS256 서명) → validator 코드 경로 동일
"""

from __future__ import annotations

import os

# 단위 테스트는 항상 skip-auth 시맨틱으로 실행한다 — dev .env(샌드박스 issuer·skip_auth
# off)와 무관하게 validator 가 테스트의 dev-issuer JWT(dev-keys 서명)를 받게 하기 위함.
# app.core.config(=settings 로드) import 전에 설정해야 반영된다. 이 테스트 프로세스의
# env 에만 영향 — 운영/dev 런타임과 무관하다. (SKIP_AUTH=true 를 수동으로 붙일 필요 제거)
os.environ["SKIP_AUTH"] = "true"

import time
from collections.abc import AsyncIterator
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from jose import jwt
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings
from app.core.db import get_db
from app.main import app
from app.models import Base

# ---------------------------------------------------------------------------
# DB 셋업 — 테스트 전용 별도 DB
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
    """세션 전체 한 번 — 테스트 DB 스키마 생성·삭제."""
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
    """매 테스트 시작 시 Redis throttle/revocation 캐시 비움.

    싱글톤은 session loop 안에서 살아있으므로 리셋 안 함.
    사용 후 키만 청소 — 테스트 간 격리.
    """
    from app.core.redis import get_redis

    redis = get_redis()
    for prefix in ("sync:*", "revoked_sid:*", "rl:public:*", "gw_me:*"):
        keys = await redis.keys(prefix)
        if keys:
            await redis.delete(*keys)
    yield


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    """테스트마다 새 트랜잭션 — 끝나면 롤백.

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
# HTTP client — get_db override해서 트랜잭션 공유
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def client(db_session: AsyncSession, monkeypatch) -> AsyncIterator[AsyncClient]:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    # Webhook dispatcher 의 백그라운드 세션이 테스트 트랜잭션을 못 보는 문제 회피:
    # _deliver_one 이 호출하는 AsyncSessionLocal() 을 — context manager 진입 시 db_session 을
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

    # 배경 dispatch 를 테스트에선 동기(await)로 — create_task 가 공유 db_session 을
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

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# JWT 발급 헬퍼 — dev 키로 서명 (production code path 동일)
# ---------------------------------------------------------------------------


@pytest.fixture
def make_jwt():
    """make_jwt(sub, groups=[...], roles=[...]) → Bearer 값."""
    from pathlib import Path

    key_path = Path(__file__).resolve().parents[2] / "dev-keys" / "private.pem"
    private_key = key_path.read_text()

    def _make(
        sub: str,
        *,
        email: str | None = None,
        groups: list[str] | None = None,
        roles: list[str] | None = None,
        sid: str | None = None,
    ) -> str:
        now = int(time.time())
        claims = {
            "sub": sub,
            "email": email or f"{sub}@test.local",
            "name": f"{sub} (test)",
            "groups": groups or [],
            "realm_access": {"roles": roles or []},
            "sid": sid or str(uuid4()),
            "iss": "dev-issuer",
            "aud": settings.oidc_audience or "ashfield",
            "iat": now,
            "exp": now + 3600,
        }
        return jwt.encode(
            claims, private_key, algorithm="RS256", headers={"kid": "dev-key-2026"}
        )

    return _make


@pytest.fixture
def mock_storage(monkeypatch):
    """S3 호출을 인메모리로 흉내 — presign 은 가짜 URL, head 는 항상 성공."""
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
        # 완료 시 일반 object 로 변환 — head 가 조회 가능하도록 등록
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
    """편의 헬퍼 — auth_headers(sub, ...) → Authorization + X-Active-Company-Id."""

    def _headers(
        sub: str,
        *,
        groups: list[str] | None = None,
        roles: list[str] | None = None,
        active_company: str | None = None,
    ) -> dict[str, str]:
        token = make_jwt(sub, groups=groups, roles=roles)
        headers = {"Authorization": f"Bearer {token}"}
        if active_company:
            headers["X-Active-Company-Id"] = active_company
        return headers

    return _headers
