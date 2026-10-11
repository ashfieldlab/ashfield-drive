# =============================================================================
# Ashfield Drive : 통합 명령
#
# SPEC §4.2 참조. 모든 개발 명령은 이 파일을 통과한다.
# =============================================================================

# .env가 있으면 로드 (BACKEND_PORT / FRONTEND_PORT 등). 없으면 조용히 건너뜀.
-include .env

# dev 서버 포트: .env에 없으면 기본값 사용.
BACKEND_PORT ?= 8200
FRONTEND_PORT ?= 3200

.PHONY: help setup client-secret dev \
        infra stop \
        backend frontend \
        migrate migration auth-migrate \
        pytest typecheck lint \
        e2e e2e-ui storybook \
        ci-local hooks smoke \
        clean install \
        deploy-git-init deploy-init deploy deploy-ps deploy-logs deploy-backup


help:  ## 사용 가능한 명령 목록
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)


# -----------------------------------------------------------------------------
# 빠른 시작
# -----------------------------------------------------------------------------

ACCOUNT_DIR ?= ../ashfield-account
CLIENT_ID := ashfield-drive

setup:  ## 처음 한 번: 의존성 설치, .env 생성, 인프라 기동, DB 마이그레이션
	$(MAKE) install
	@test -f .env || cp .env.example .env
	@test -f frontend/.env || cp frontend/.env.example frontend/.env
	@$(MAKE) --no-print-directory client-secret
	docker compose up -d --wait
	$(MAKE) migrate auth-migrate
	@echo "✓ 준비 완료. 계정 서버를 띄운 뒤 make dev"

client-secret:  ## 계정 서버가 발급한 client secret 을 frontend/.env 에 채움
	@f=$(ACCOUNT_DIR)/.secrets/clients.local.json; \
	if [ ! -f $$f ]; then echo "! $$f 없음: 계정 서버에서 make setup 먼저"; exit 0; fi; \
	secret=$$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))[sys.argv[2]]['client_secret'])" $$f $(CLIENT_ID)); \
	sed -i "s|^ASHFIELD_CLIENT_SECRET=.*|ASHFIELD_CLIENT_SECRET=$$secret|" frontend/.env && echo "✓ client secret 설정"

dev:  ## 백엔드 + 프론트 dev 서버 함께 실행 (Ctrl+C 로 둘 다 종료)
	$(MAKE) -j2 --no-print-directory backend frontend

# -----------------------------------------------------------------------------
# 인프라 (docker-compose)
# -----------------------------------------------------------------------------

infra:  ## redis + postgres + minio + mailpit 컨테이너 띄움
	docker compose up -d
	@echo "✓ Redis :$${REDIS_HOST_PORT:-16479}, PostgreSQL :$${POSTGRES_HOST_PORT:-15532}, MinIO API :$${MINIO_HOST_PORT:-19200} / Console :$${MINIO_CONSOLE_HOST_PORT:-19201}, Mailpit SMTP :$${MAILPIT_SMTP_HOST_PORT:-11025} / Web :$${MAILPIT_WEB_HOST_PORT:-18025}"

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

auth-migrate:  ## Better Auth 테이블 생성과 갱신 (Postgres 스키마 auth: 세션과 계정 서버 토큰, ADR-0024)
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

e2e:  ## Playwright E2E (전제: 계정 서버 :3300 기동(AUTH_DEV_PASSWORD_LOGIN=true) + infra, migrate, auth-migrate, backend, frontend .env 의 ASHFIELD_CLIENT_SECRET)
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

ci-local:  ## push 전 전체 검증 (typecheck + lint + pytest + build): e2e는 ci-full
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
# 운영 배포 (docs/deploy.md): 서버가 GitHub origin/main 을 받아 scripts/prod.sh 실행
# -----------------------------------------------------------------------------

DEPLOY_HOST ?= ovm
DEPLOY_DIR ?= ashfield/drive
# 서버는 자기 ssh 키(레포 소유 GitHub 계정에 등록)로 GitHub 에서 직접 받는다.
# 추적하지 않는 서버 전용 파일(.env.prod, backups/ 등)은 그대로 남는다.
DEPLOY_SLUG := $(shell git remote get-url origin | sed -E 's#\.git$$##; s#^.*[:/]([^/]+/[^/]+)$$#\1#')
DEPLOY_PULL := git -C $(DEPLOY_DIR) fetch -q origin main && git -C $(DEPLOY_DIR) checkout -q -f -B main origin/main && git -C $(DEPLOY_DIR) log -1 --format="→ %h %s"

deploy-git-init:  ## 처음 한 번: 서버 배포 디렉터리를 GitHub 체크아웃으로 (서버 키 등록 안내가 나오면 등록 후 다시 실행)
	ssh $(DEPLOY_HOST) 'sh -s -- $(DEPLOY_SLUG) $(DEPLOY_DIR)' < scripts/server-git-init.sh


deploy-init: ## 처음 한 번 (계정 서버 배포 후): 서버에 .env.prod 생성, 비밀값 채움 (ADMIN_EMAIL=관리자 이메일)
	ssh $(DEPLOY_HOST) '$(DEPLOY_PULL) && ADMIN_EMAIL="$(ADMIN_EMAIL)" sh $(DEPLOY_DIR)/scripts/prod.sh init-env'

deploy: ## 운영 배포: GitHub origin/main 받기, 빌드, 마이그레이션(Alembic, Better Auth), 재시작
	@git fetch -q origin main && test -z "$$(git log --oneline origin/main..HEAD)" || echo "! push 하지 않은 커밋은 배포되지 않습니다 (서버는 origin/main 을 받는다)"
	ssh $(DEPLOY_HOST) '$(DEPLOY_PULL) && sh $(DEPLOY_DIR)/scripts/prod.sh up'

deploy-ps:  ## 운영 컨테이너 상태
	ssh $(DEPLOY_HOST) 'sh $(DEPLOY_DIR)/scripts/prod.sh ps'

deploy-logs:  ## 운영 로그 follow
	ssh -t $(DEPLOY_HOST) 'sh $(DEPLOY_DIR)/scripts/prod.sh logs'

deploy-backup:  ## 운영 Postgres 덤프 (서버의 backups/)
	ssh $(DEPLOY_HOST) 'sh $(DEPLOY_DIR)/scripts/prod.sh backup'


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
