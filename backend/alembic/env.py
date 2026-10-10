"""
Alembic env — async + DATABASE_URL 환경변수 사용.

Phase 3에서 모델 등록 (Base.metadata 주입):
  from app.models import Base
  target_metadata = Base.metadata
"""

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# app.core.config가 .env 파일 + 환경변수 둘 다 처리 — alembic도 그걸 신뢰
from app.core.config import settings  # noqa: E402
from app.models import Base  # noqa: E402

config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = Base.metadata

# Better Auth(프론트)가 자기 테이블을 별도 스키마 `auth` 에 둔다 (ADR-0023). 그 스키마는
# Better Auth CLI(`make auth-migrate`)가 관리하므로 Alembic 은 보지도 건드리지도 않는다.
# include_schemas 기본값(False)이라 autogenerate 는 기본 스키마만 반사하지만, 명시적으로도 거른다.
EXCLUDED_SCHEMAS = {"auth"}


def include_name(name, type_, parent_names) -> bool:
    if type_ == "schema":
        return name not in EXCLUDED_SCHEMAS
    if type_ == "table":
        return parent_names.get("schema_name") not in EXCLUDED_SCHEMAS
    return True


def include_object(obj, name, type_, reflected, compare_to) -> bool:
    return getattr(obj, "schema", None) not in EXCLUDED_SCHEMAS


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_name=include_name,
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_name=include_name,
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
