#!/bin/sh
# 운영 서버에서 실행한다 (로컬 make deploy-init, make deploy 가 ssh 로 부른다). docs/deploy.md
#
#   sh scripts/prod.sh init-env   .env.prod 생성, 비밀값 채움 (값은 출력하지 않음)
#   sh scripts/prod.sh up         빌드, 마이그레이션(Alembic, Better Auth), 기동
#   sh scripts/prod.sh ps | logs | backup
set -eu
cd "$(dirname "$0")/.."

CLIENT_ID=ashfield-drive
# 계정 서버 배포 디렉터리 (.secrets/clients.local.json 을 읽는다)
ACCOUNT_DIR=${ACCOUNT_DIR:-../account}

dc() { docker compose -f docker-compose.prod.yml --env-file .env.prod "$@"; }

# KEY=<자리표시> 인 줄만 새 값으로 바꾼다 (이미 채운 값은 그대로).
fill() {
  if grep -q "^$1=$2\$" .env.prod; then
    sed -i "s|^$1=$2\$|$1=$3|" .env.prod
    echo "  $1 채움"
  fi
}

# KEY= (빈 값) 인 줄만 채운다.
fill_empty() {
  if [ -n "$2" ] && grep -q "^$1=\$" .env.prod; then
    sed -i "s|^$1=\$|$1=$2|" .env.prod
    echo "  $1=$2"
  fi
}

client_secret() {
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]]["client_secret"])' \
    "$ACCOUNT_DIR/.secrets/clients.local.json" "$CLIENT_ID"
}

check_env() {
  missing=$(grep -E '^[A-Z_]+=__[A-Z_]+__$' .env.prod | cut -d= -f1 || true)
  [ -z "$missing" ] || { echo "! .env.prod 에 채울 값: $missing"; return 1; }
}

init_env() {
  if [ ! -f .env.prod ]; then
    cp .env.prod.example .env.prod
    chmod 600 .env.prod
    echo ".env.prod 생성"
  fi
  fill POSTGRES_PASSWORD __GENERATE__ "$(openssl rand -hex 24)"
  fill BETTER_AUTH_SECRET __GENERATE__ "$(openssl rand -base64 32)"
  fill S3_ACCESS_KEY __GENERATE__ "$(openssl rand -hex 10)"
  fill S3_SECRET_KEY __GENERATE__ "$(openssl rand -hex 24)"
  # Fernet 키 = url-safe base64 로 쓴 32바이트
  fill SMTP_ENCRYPTION_KEY __GENERATE__ "$(openssl rand -base64 32 | tr '+/' '-_')"
  if grep -q "^ASHFIELD_CLIENT_SECRET=__FROM_ACCOUNT__\$" .env.prod; then
    if [ -f "$ACCOUNT_DIR/.secrets/clients.local.json" ]; then
      fill ASHFIELD_CLIENT_SECRET __FROM_ACCOUNT__ "$(client_secret)"
    else
      echo "! $ACCOUNT_DIR/.secrets/clients.local.json 없음: 계정 서버를 먼저 배포하세요"
    fi
  fi
  fill_empty SYSTEM_ADMIN_EMAILS "${ADMIN_EMAIL:-}"
  check_env || true
}

up() {
  [ -f .env.prod ] || { echo "! .env.prod 없음: make deploy-init 먼저"; exit 1; }
  check_env
  dc --profile tools build
  dc up -d --wait postgres redis minio
  echo "→ Alembic 마이그레이션"
  dc run --rm --no-deps backend python -m alembic upgrade head
  echo "→ Better Auth 마이그레이션"
  dc run --rm auth-migrate
  dc up -d --wait --remove-orphans
  dc ps
}

backup() {
  mkdir -p backups
  f="backups/ashfield-drive-$(date +%Y%m%d-%H%M).sql.gz"
  dc exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$f"
  echo "백업: $f"
}

case "${1:-}" in
  init-env) init_env ;;
  up) up ;;
  ps) dc ps ;;
  logs) dc logs -f --tail=100 ;;
  backup) backup ;;
  *) echo "usage: $0 init-env|up|ps|logs|backup"; exit 2 ;;
esac
