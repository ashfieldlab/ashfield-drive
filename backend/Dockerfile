# =============================================================================
# Backend (FastAPI) Dockerfile: multi-stage, 비root
# =============================================================================

# -----------------------------------------------------------------------------
# Builder
# -----------------------------------------------------------------------------
FROM python:3.14-slim AS builder

WORKDIR /app

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

# 빌드 도구 (asyncpg 등 컴파일 필요)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY app ./app

# 운영 의존성만 (dev extra 의 pytest, ruff 등은 넣지 않는다)
RUN pip install --target=/install .


# -----------------------------------------------------------------------------
# Runtime
# -----------------------------------------------------------------------------
FROM python:3.14-slim AS runtime

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/install:/app \
    PATH=/install/bin:$PATH

# 비root 사용자
RUN groupadd -g 1000 app && \
    useradd -u 1000 -g app -s /bin/bash -m app

COPY --from=builder /install /install
COPY --chown=app:app app ./app
COPY --chown=app:app alembic ./alembic
COPY --chown=app:app alembic.ini ./

USER app

EXPOSE 8000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health').read()" || exit 1

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
