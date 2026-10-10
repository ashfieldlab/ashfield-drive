"""
SQLAlchemy 2.0 async: engine + session factory.

Dependency: get_db()
"""

import json
from collections.abc import AsyncIterator
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings


def _json_default(obj: object) -> str:
    """JSONB 직렬화 기본 변환: 기본 json.dumps 가 못 다루는 타입 보강.

    audit_logs.meta 등 JSONB 컬럼에 date/datetime/Decimal/UUID 가 들어가면
    기본 직렬화기가 TypeError 를 내므로 여기서 문자열로 변환한다.
    """
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return str(obj)
    if isinstance(obj, UUID):
        return str(obj)
    raise TypeError(
        f"Object of type {obj.__class__.__name__} is not JSON serializable"
    )


def _json_serializer(value: object) -> str:
    return json.dumps(value, default=_json_default, ensure_ascii=False)


engine = create_async_engine(
    settings.database_url,
    echo=False,  # 카테고리 logger.debug로 SQL 추적: Phase 3+에서 이벤트 hook
    pool_pre_ping=True,
    json_serializer=_json_serializer,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: request 단위 트랜잭션."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        else:
            await session.commit()
