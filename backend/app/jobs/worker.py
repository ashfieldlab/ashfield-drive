"""arq worker 부트스트랩.

실행:
    cd backend && . .venv/bin/activate && python -m arq app.jobs.worker.WorkerSettings
또는:
    make worker

운영에선 별도 프로세스(컨테이너) 로 띄움. FastAPI 프로세스 죽어도 큐는 살아있고
반대도 마찬가지. Redis 다운 시 worker 는 backoff 재시도(arq 기본).

cron_jobs 는 app.jobs.registry.JOBS 단일 소스에서 생성: 잡 추가는 거기 한 줄.
모든 잡은 recorded() 를 거쳐 JobRun 원장에 실행 기록을 남긴다.
"""

from urllib.parse import urlparse

from arq import cron
from arq.connections import RedisSettings

from app.core.config import settings
from app.core.logging import logger
from app.jobs.registry import JOBS
from app.jobs.runner import recorded


def _redis_settings() -> RedisSettings:
    """settings.redis_url → arq RedisSettings.

    redis_url 예: redis://localhost:16479  또는  redis://:password@host:6379/0
    """
    u = urlparse(settings.redis_url)
    return RedisSettings(
        host=u.hostname or "localhost",
        port=u.port or 6379,
        password=u.password,
        database=int((u.path or "/0").lstrip("/") or 0),
    )


async def on_startup(ctx: dict) -> None:
    logger.info("arq_worker_started", extra={"category": "biz"})


async def on_shutdown(ctx: dict) -> None:
    logger.info("arq_worker_stopped", extra={"category": "biz"})


class WorkerSettings:
    functions: list = []
    cron_jobs = [
        cron(recorded(spec.name, spec.fn), **spec.cron_kwargs) for spec in JOBS
    ]
    redis_settings = _redis_settings()
    on_startup = on_startup
    on_shutdown = on_shutdown
