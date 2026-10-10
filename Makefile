# =============================================================================
# Ashfield Drive — 통합 명령
#
# SPEC §4.2 참조. 모든 개발 명령은 이 파일을 통과한다.
# =============================================================================

# .env가 있으면 로드 (BACKEND_PORT / FRONTEND_PORT 등). 없으면 조용히 건너뜀.
-include .env

# dev 서버 포트 — .env에 없으면 기본값 사용.
BACKEND_PORT ?= 8200
FRONTEND_PORT ?= 3200

.PHONY: help \
        infra stop \
        backend frontend \
        migrate migration auth-migrate \
        pytest typecheck lint \
        e2e e2e-ui storybook \
        ci-local hooks smoke \
        clean install


help:  ## 사용 가능한 명령 목록
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)


# -----------------------------------------------------------------------------
# 인프라 (docker-compose)
# -----------------------------------------------------------------------------

infra:  ## redis + postgres + minio + mailpit 컨테이너 띄움
	docker compose up -d
	@echo "✓ Redis :$${REDIS_HOST_PORT:-16479} · PostgreSQL :$${POSTGRES_HOST_PORT:-15532} · MinIO API :$${MINIO_HOST_PORT:-19200} / Console :$${MINIO_CONSOLE_HOST_PORT:-19201} · Mailpit SMTP :$${MAILPIT_SMTP_HOST_PORT:-11025} / Web :$${MAILPIT_WEB_HOST_PORT:-18025}"

stop:  ## 인프라 컨테이너 중지
	docker compose down


# -----------------------------------------------------------------------------
# 앱 실행 (호스트에서, hot-reload)
# -----------------------------------------------------------------------------

backend:  ## FastAPI dev 서버 (BACKEND_PORT, 기본 8200)
	cd backend && . .venv/bin/activate && uvicorn app.main:app --reload --port $(BACKEND_PORT)

frontend:  ## Next.js dev 서버 (FRONTEND_PORT, 기본 3200)
	cd frontend && PORT=$(FRONTEND_PORT) npm run dev

worker:  ## arq worker (백그라운드 잡 + cron 디스패치)
	cd backend && . .venv/bin/activate && python -m arq app.jobs.worker.WorkerSettings


# -----------------------------------------------------------------------------
# DB
# -----------------------------------------------------------------------------

migrate:  ## alembic upgrade head
	cd backend && . .venv/bin/activate && alembic upgrade head

auth-migrate:  ## Better Auth 테이블 생성·갱신 (Postgres 스키마 auth: 세션·계정 서버 토큰, ADR-0024)
	cd frontend && npx auth migrate --config lib/auth/server.ts --yes

migration:  ## 새 alembic revision 생성 (msg="..." 인자 필수)
	@if [ -z "$(msg)" ]; then echo "usage: make migration msg=\"add foo\""; exit 1; fi
	cd backend && . .venv/bin/activate && alembic revision --autogenerate -m "$(msg)"


# -----------------------------------------------------------------------------
# 품질 검증
# -----------------------------------------------------------------------------

pytest:  ## 백엔드 pytest
	cd backend && . .venv/bin/activate && pytest

vitest:  ## 프론트 vitest (unit + storybook)
	cd frontend && npx vitest run

typecheck:  ## 프론트 TypeScript check
	cd frontend && npx tsc --noEmit

lint:  ## 프론트 eslint + 백엔드 ruff
	cd frontend && npm run lint
	cd backend && . .venv/bin/activate && ruff check .

e2e:  ## Playwright E2E (전제: 계정 서버 :3300 기동(AUTH_DEV_PASSWORD_LOGIN=true) + infra·migrate·auth-migrate·backend, frontend .env 의 ASHFIELD_CLIENT_SECRET)
	cd frontend && PORT=$(FRONTEND_PORT) npx playwright test

e2e-ui:  ## Playwright UI 모드
	cd frontend && npx playwright test --ui

e2e-install:  ## Playwright 브라우저 설치 (최초 1회)
	cd frontend && npx playwright install --with-deps chromium

storybook:  ## Storybook dev 서버
	cd frontend && npm run storybook


# -----------------------------------------------------------------------------
# 통합
# -----------------------------------------------------------------------------

fe-build:  ## 프론트엔드 production 빌드
	cd frontend && npm run build

ci-local:  ## push 전 전체 검증 (typecheck + lint + pytest + build) — e2e는 ci-full
	$(MAKE) typecheck
	$(MAKE) lint
	$(MAKE) pytest
	$(MAKE) fe-build

ci-full:  ## ci-local + e2e (Playwright 브라우저 사전 설치 필요)
	$(MAKE) ci-local
	$(MAKE) e2e

hooks:  ## .githooks 활성화 (pre-push 등)
	git config core.hooksPath .githooks
	chmod +x .githooks/pre-push
	@echo "✓ Git hooks 활성화됨 (.githooks/pre-push)"

smoke:  ## docker로 풀스택 띄우고 smoke 호출 (TODO: Phase 5)
	@echo "TODO: scripts/smoke.sh"


# -----------------------------------------------------------------------------
# 운영 배포 (docker-compose.prod.yml)
# -----------------------------------------------------------------------------

# 모든 prod 명령은 .env.prod 강제 — 없으면 stop. 운영 secret 누락 사고 방지.
PROD_COMPOSE := docker compose -f docker-compose.prod.yml --env-file .env.prod

prod-check-env:
	@test -f .env.prod || { echo "✗ .env.prod 없음. cp .env.prod.example .env.prod 후 채우세요."; exit 1; }

prod-build: prod-check-env  ## 운영 이미지 빌드
	$(PROD_COMPOSE) build --pull

prod-up: prod-check-env  ## 운영 스택 기동 (build + up -d + migrate)
	$(PROD_COMPOSE) build
	$(PROD_COMPOSE) up -d
	@echo "→ 마이그레이션 적용 중…"
	$(PROD_COMPOSE) exec -T backend python -m alembic upgrade head
	$(PROD_COMPOSE) run --rm auth-migrate
	@echo "✓ 운영 스택 기동 완료. status: make prod-status"

prod-down: prod-check-env  ## 운영 스택 정지
	$(PROD_COMPOSE) down

prod-restart: prod-check-env  ## 무중단 재시작 (이미지 재빌드 X)
	$(PROD_COMPOSE) restart

prod-rebuild: prod-check-env  ## 특정 서비스만 재빌드+재기동 (사용: make prod-rebuild SVC=backend)
	@test -n "$(SVC)" || { echo "✗ SVC=<service-name> 지정 필요"; exit 1; }
	$(PROD_COMPOSE) build $(SVC)
	$(PROD_COMPOSE) up -d $(SVC)

prod-dc: prod-check-env  ## 임의 docker compose 명령 (escape hatch, 사용: make prod-dc ARGS='ps')
	@test -n "$(ARGS)" || { echo "✗ ARGS='<command>' 지정 필요"; exit 1; }
	$(PROD_COMPOSE) $(ARGS)

prod-migrate: prod-check-env  ## alembic upgrade head
	$(PROD_COMPOSE) exec -T backend python -m alembic upgrade head

prod-auth-migrate: prod-check-env  ## Better Auth 테이블 생성·갱신 (스키마 auth)
	$(PROD_COMPOSE) run --rm auth-migrate

prod-logs: prod-check-env  ## 전체 로그 follow
	$(PROD_COMPOSE) logs -f --tail=100

prod-logs-backend: prod-check-env  ## 백엔드 로그만
	$(PROD_COMPOSE) logs -f --tail=100 backend

prod-logs-worker: prod-check-env  ## 워커 로그만 (알림·PII 마스킹 cron 추적)
	$(PROD_COMPOSE) logs -f --tail=100 worker

prod-status: prod-check-env  ## 컨테이너 상태 + 헬스
	$(PROD_COMPOSE) ps

prod-shell-backend: prod-check-env  ## 백엔드 컨테이너 shell
	$(PROD_COMPOSE) exec backend bash

prod-backup: prod-check-env  ## Postgres dump → backups/ashfield-drive-YYYYMMDD-HHMM.sql.gz
	@mkdir -p backups
	@FNAME=backups/ashfield-drive-$$(date +%Y%m%d-%H%M).sql.gz; \
	$(PROD_COMPOSE) exec -T postgres pg_dump -U "$$(grep ^POSTGRES_USER .env.prod | cut -d= -f2)" "$$(grep ^POSTGRES_DB .env.prod | cut -d= -f2)" | gzip > $$FNAME; \
	echo "✓ 백업 완료: $$FNAME"


# -----------------------------------------------------------------------------
# 부트스트랩
# -----------------------------------------------------------------------------

install:  ## frontend + backend 의존성 설치
	cd frontend && npm install
	cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
	@echo "✓ 모든 의존성 설치 완료"

clean:  ## 빌드 결과물 + node_modules + .venv 삭제
	rm -rf frontend/node_modules frontend/.next frontend/out
	rm -rf backend/.venv backend/.pytest_cache backend/.ruff_cache backend/dist backend/build
	find backend -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	@echo "✓ 정리 완료"
