"""mark-all-read 앱 스코프 — 현재 앱 알림만 읽음 처리.

버그: 앱별로 걸러 보여주는데 "모두 읽음"이 전 앱을 처리해 안 본 알림까지 소실.
"""

import uuid

import pytest
from httpx import AsyncClient

CO = "co-scope"
ALICE = "u-scope-alice"


async def _seed(db):
    from app.models.company import Company
    from app.models.notification import Notification
    from app.models.user import User

    db.add(Company(id=CO, name="Scope Co"))
    db.add(User(id=ALICE, email="alice@x"))
    await db.flush()
    node_id, event_id = str(uuid.uuid4()), str(uuid.uuid4())
    db.add(
        Notification(
            id=node_id, recipient_sub=ALICE, company_id=CO, actor_sub=None,
            type="node_shared", entity_type="node", entity_id="n1", payload={},
        )
    )
    db.add(
        Notification(
            id=event_id, recipient_sub=ALICE, company_id=CO, actor_sub=None,
            type="event_invited", entity_type="event", entity_id="e1", payload={},
        )
    )
    await db.flush()
    return node_id, event_id


@pytest.mark.asyncio
async def test_mark_all_read_scoped_to_entity_types(
    client: AsyncClient, auth_headers, db_session
):
    from app.models.notification import Notification

    node_id, event_id = await _seed(db_session)
    headers = auth_headers(ALICE, groups=[CO], active_company=CO)

    # 파일 앱 스코프 — node 만 읽음 처리
    r = await client.post(
        "/api/v1/notifications/mark-all-read?entity_types=node", headers=headers
    )
    assert r.status_code == 200
    assert r.json()["marked"] == 1

    node_n = await db_session.get(Notification, node_id)
    event_n = await db_session.get(Notification, event_id)
    await db_session.refresh(node_n)
    await db_session.refresh(event_n)
    assert node_n.read_at is not None  # 파일 알림은 읽음
    assert event_n.read_at is None  # 일정 알림은 안 읽음(보존)


@pytest.mark.asyncio
async def test_list_pagination_and_entity_scope(
    client: AsyncClient, auth_headers, db_session
):
    """offset 페이지네이션 + entity_types 앱 스코프 + has_more 플래그."""
    from app.models.company import Company
    from app.models.notification import Notification
    from app.models.user import User

    db_session.add(Company(id=CO, name="Scope Co"))
    db_session.add(User(id=ALICE, email="alice@x"))
    await db_session.flush()
    # node 5건 + event 2건
    for i in range(5):
        db_session.add(
            Notification(
                id=str(uuid.uuid4()), recipient_sub=ALICE, company_id=CO,
                actor_sub=None, type="node_shared", entity_type="node",
                entity_id=f"n{i}", payload={},
            )
        )
    for i in range(2):
        db_session.add(
            Notification(
                id=str(uuid.uuid4()), recipient_sub=ALICE, company_id=CO,
                actor_sub=None, type="event_invited", entity_type="event",
                entity_id=f"e{i}", payload={},
            )
        )
    await db_session.flush()
    headers = auth_headers(ALICE, groups=[CO], active_company=CO)

    # node 스코프 첫 페이지(limit=3) → 3건 + has_more
    r = await client.get(
        "/api/v1/notifications?entity_types=node&limit=3&offset=0", headers=headers
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["notifications"]) == 3
    assert body["has_more"] is True
    assert all(n["entity_type"] == "node" for n in body["notifications"])

    # 다음 페이지 → 남은 2건 + has_more False
    r = await client.get(
        "/api/v1/notifications?entity_types=node&limit=3&offset=3", headers=headers
    )
    body = r.json()
    assert len(body["notifications"]) == 2
    assert body["has_more"] is False


@pytest.mark.asyncio
async def test_mark_all_read_no_filter_marks_all(
    client: AsyncClient, auth_headers, db_session
):
    from app.models.notification import Notification

    node_id, event_id = await _seed(db_session)
    headers = auth_headers(ALICE, groups=[CO], active_company=CO)

    r = await client.post("/api/v1/notifications/mark-all-read", headers=headers)
    assert r.status_code == 200
    assert r.json()["marked"] == 2  # 필터 없으면 전체

    for nid in (node_id, event_id):
        n = await db_session.get(Notification, nid)
        await db_session.refresh(n)
        assert n.read_at is not None
