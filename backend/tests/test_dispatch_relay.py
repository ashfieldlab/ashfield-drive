"""dispatch_relay: 미처리 알림 수거 cron (#2).

즉시경로가 놓친(2분+ 미처리) Notification 만 relay 가 주워 발송 + emailed_at 스탬프.
send_for_event 는 성공 스텁(SMTP 없이), 세션은 테스트 트랜잭션으로 monkeypatch.
"""

import contextlib
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.jobs.dispatch_relay import dispatch_pending
from app.models.notification import Notification
from app.models.user import User
from app.models.workspace import Workspace


@pytest_asyncio.fixture
async def patched(db_session, monkeypatch):
    @contextlib.asynccontextmanager
    async def fake_factory():
        yield db_session

    import app.jobs.dispatch_relay as relay
    import app.services.notifications as notif

    monkeypatch.setattr(relay, "AsyncSessionLocal", fake_factory)
    monkeypatch.setattr(notif, "AsyncSessionLocal", fake_factory)

    calls: list[dict] = []

    async def fake_send(**kw):
        calls.append(kw)
        return "sent"

    monkeypatch.setattr(notif, "send_for_event", fake_send)
    return db_session, calls


async def _seed(db: AsyncSession) -> None:
    db.add(Workspace(id="c-a", name="C"))
    db.add(User(id="u-a", email="a@x"))
    db.add(User(id="u-b", email="b@x"))
    await db.flush()


def _notif(nid: str, minutes_ago: int, emailed: bool = False) -> Notification:
    return Notification(
        id=nid,
        recipient_sub="u-b",
        workspace_id="c-a",
        actor_sub="u-a",
        type="node_shared",
        entity_type="node",
        entity_id="n1",
        payload={},
        emailed_at=datetime.now(UTC) if emailed else None,
        created_at=datetime.now(UTC) - timedelta(minutes=minutes_ago),
    )


@pytest.mark.asyncio
async def test_relay_sends_stranded_email_and_stamps(patched):
    db, calls = patched
    await _seed(db)
    db.add(_notif("n-old", minutes_ago=5))
    await db.flush()

    processed = await dispatch_pending({})

    assert processed == 1
    assert len(calls) == 1 and calls[0]["recipient_sub"] == "u-b"
    row = await db.get(Notification, "n-old")
    assert row.emailed_at is not None


@pytest.mark.asyncio
async def test_relay_skips_recent_and_already_sent(patched):
    db, calls = patched
    await _seed(db)
    db.add(_notif("n-recent", minutes_ago=1))  # grace 안 (2분 미만)
    db.add(_notif("n-sent", minutes_ago=5, emailed=True))  # 이미 발송됨
    await db.flush()

    processed = await dispatch_pending({})

    assert processed == 0
    assert calls == []
