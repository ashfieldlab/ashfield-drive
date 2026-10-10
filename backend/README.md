# Backend (FastAPI)

Ashfield Drive 백엔드 (FastAPI). 자세한 내용은 루트 [`SPEC.md`](../SPEC.md) §3 참조.

## 빠른 시작 (Phase 1 시점)

```bash
cd backend

# 가상환경 생성 + 의존성 설치
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# dev 서버
uvicorn app.main:app --reload --port 8200

# 또는 uv 사용
uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"
```

검증: `curl http://localhost:8200/health` → `{"status":"ok"}`

## Phase별 추가 예정

| Phase | 추가 내용 |
|-------|----------|
| 2 | Dockerfile, .env, alembic init |
| 3 | JWT 검증, revocation, lazy upsert, models, /me 라우트 |
| 4 | Item 모델 + 라우트, admin 라우트, pytest |
| 5 | CLAUDE.md, README 최종판 |
