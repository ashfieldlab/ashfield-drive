# 로컬 개발 (Ashfield 스위트)

Ashfield 계정 서버를 먼저 띄우고, 그다음 이 앱을 띄운다. 로그인은 계정 서버(OIDC)로만 한다 ([ADR-0024](adr/0024-account-server-sso.md)).

## 포트

앱끼리 겹치지 않게 정해 둔 기본값이다. 3000 과 19000 은 VS Code 가 쓰므로 피한다.

| 앱 | 웹 | 백엔드 | Postgres | Redis | Mailpit SMTP / Web | 기타 |
|---|---|---|---|---|---|---|
| Account | 3300 | (웹과 같음) | 5632 | | | |
| Calendar | 3100 | 8100 | 15542 | 16489 | 11035 / 18035 | CalDAV 18090 |
| **Drive** | **3200** | **8200** | **15532** | **16479** | **11025 / 18025** | **S3(MinIO) 19200, 콘솔 19201** |

포트를 바꾸려면 루트 `.env` 의 `*_HOST_PORT`, `FRONTEND_PORT`, `BACKEND_PORT` 와 `frontend/.env` 의 `BETTER_AUTH_URL` 을 함께 바꾸고, 계정 서버의 `DRIVE_URL` 도 바꾼 뒤 계정 서버에서 `make seed` 를 다시 실행한다.

## 1. 계정 서버 (`../ashfield-account`)

```
make setup     # npm install, .env 생성, Postgres(5632), 테이블, OAuth 클라이언트 등록
make dev       # http://localhost:3300 (.env 기본값 AUTH_DEV_PASSWORD_LOGIN=true)
```

`make seed` 가 `ashfield-drive` client secret 을 출력하고 `ashfield-account/.secrets/clients.local.json` 에 저장한다.
계정 서버에 등록되는 값: redirect URI `http://localhost:3200/api/auth/callback/ashfield`, resource(토큰 `aud`) `http://localhost:3200`.

## 2. 이 앱

```
make install                            # frontend + backend 의존성
cp .env.example .env                    # 백엔드 AUTH_* 기본값이 계정 서버를 가리킨다
cp frontend/.env.example frontend/.env
make infra                              # postgres, redis, minio, mailpit, worker
make migrate                            # Alembic
make auth-migrate                       # Better Auth 테이블 (스키마 auth: 세션, 계정 서버 토큰)
```

`frontend/.env` 에서 두 값을 채운다.

- `BETTER_AUTH_SECRET`: `openssl rand -base64 32`
- `ASHFIELD_CLIENT_SECRET`: 계정 서버 `.secrets/clients.local.json` 의 `ashfield-drive.client_secret`

```
python3 -c "import json;print(json.load(open('../ashfield-account/.secrets/clients.local.json'))['ashfield-drive']['client_secret'])"
```

앱은 터미널을 나눠 띄운다.

```
make backend     # http://localhost:8200 (API 문서 /docs)
make frontend    # http://localhost:3200
make worker      # arq 백그라운드 워커 (선택, compose 의 worker 와 같은 것)
```

`http://localhost:3200` 에서 "Ashfield 계정으로 로그인" 을 누르면 계정 서버 로그인 화면(로컬은 DEV 이메일+비밀번호, 처음이면 가입)을 거쳐 돌아온다. 같은 브라우저로 Calendar(`http://localhost:3100`)를 열면 비밀번호 없이 로그인된다.
계정 서버에서 워크스페이스를 만들거나 초대를 수락하면 다음 토큰 갱신(최대 15분) 또는 재로그인 때 앱에 나타난다. 로그아웃은 앱 세션과 계정 서버 세션을 함께 끝낸다.

## 환경 변수

| 위치 | 변수 | 설명 |
|---|---|---|
| frontend | `BETTER_AUTH_SECRET` | 앱 세션 쿠키 암호화. 32자 이상 무작위 |
| frontend | `BETTER_AUTH_URL` | 이 앱 공개 주소. 로그인 콜백 `${BETTER_AUTH_URL}/api/auth/callback/ashfield`, 토큰 resource(`aud`) |
| frontend | `DATABASE_URL` | 백엔드와 같은 Postgres. Better Auth 테이블은 스키마 `auth` |
| frontend | `ACCOUNT_URL` | 계정 서버 주소(issuer). 기본 `http://localhost:3300` |
| frontend | `ASHFIELD_CLIENT_ID` / `ASHFIELD_CLIENT_SECRET` | 계정 서버에 등록된 client (`ashfield-drive`) |
| backend | `AUTH_JWKS_URL` | `${ACCOUNT_URL}/api/auth/jwks` |
| backend | `AUTH_ISSUER` | `${ACCOUNT_URL}` (정확히 일치) |
| backend | `AUTH_AUDIENCE` | `${BETTER_AUTH_URL}` (토큰 `aud` 배열에 포함돼야 함) |
| backend | `SYSTEM_ADMIN_EMAILS` | System Admin 이메일, 쉼표 구분 (선택) |

| frontend | `NEXT_PUBLIC_CALENDAR_URL` | 헤더의 일정 앱 링크 (dev 기본 `http://localhost:3100`) |
| frontend | `MINIO_PROXY_TARGET` | dev 의 `/_minio/*` 프록시 대상 (기본 `http://localhost:19200`) |

로그인 수단(Google, GitHub), 허용 이메일, DEV 비밀번호 로그인은 계정 서버 설정이다. 운영 배포는 [deploy.md](deploy.md).

## E2E

`make e2e` 는 실제 계정 서버로 로그인한다. 계정 서버의 DEV 비밀번호 폼으로 가입하고 로그인해 앱으로 돌아오고(SSO, 토큰 갱신, 로그아웃 포함), 계정 서버 화면에서 워크스페이스와 초대 링크를 만들어 공유 시나리오를 돈다.

필요한 것:

- 계정 서버: `ACCOUNT_URL`(기본 `http://localhost:3300`), `AUTH_DEV_PASSWORD_LOGIN=true`, `make migrate seed` 완료
- 이 앱: infra, migrate, auth-migrate, backend 기동, `frontend/.env` 의 `ASHFIELD_CLIENT_SECRET`
- 앱 dev 서버는 Playwright 가 띄운다 (이미 떠 있으면 재사용, 포트는 `PORT`, 기본 3200)
- 토큰 갱신 E2E 는 이 앱 DB 의 `auth.account` 를 직접 고친다: `E2E_DATABASE_URL` (기본 `postgresql://ashfield:ashfield_dev@localhost:15532/ashfield_drive`)

## S3 (MinIO)

dev 는 `cgr.dev/chainguard/minio:latest` 를 쓴다. `minio/minio` 이미지는 더 이상 받을 수 없어서, 같은 MinIO 서버를 빌드한 Chainguard 이미지로 바꿨다 (환경 변수, 데이터 형식, S3 API 동일). 무료 티어는 `latest` 태그만 제공하므로 버전을 고정하려면 digest(`@sha256:...`)로 지정한다. 이미지에 curl 이 없어 healthcheck 는 함께 들어 있는 `mc ready` 를 쓴다.
버킷은 백엔드가 시작할 때 만든다 (`ensure_bucket`). 브라우저는 presigned URL 로 `http://localhost:3200/_minio/...` 에 올리고, Next rewrites 가 MinIO(19200)로 넘긴다.
