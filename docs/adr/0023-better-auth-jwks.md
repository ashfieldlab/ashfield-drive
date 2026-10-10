# 인증은 Better Auth, 백엔드는 Better Auth JWT 를 JWKS 로 검증한다

상태: **일부 대체됨: [ADR-0024](0024-account-server-sso.md)** (2026-10). 로그인 수단·`ALLOWED_EMAILS`·앱 JWT 플러그인·개인 워크스페이스 자동 생성·이메일 멤버 추가는 Ashfield 계정 서버로 옮겼다. "Better Auth 로 앱 세션, 백엔드는 Bearer JWT 를 JWKS 로 검증" 은 유지.
(원래: 외부 인증 게이트웨이 세션 차용(구 ADR-0021)·Keycloak 그룹·외부 디렉터리 연동·`SKIP_AUTH` dev 우회를 대체.)

## 배경

로그인을 외부 인증 게이트웨이(세션 쿠키 → 백엔드가 게이트웨이 `/auth/me` 조회)와 Keycloak 그룹/외부 디렉터리(회사 소속)에 맡겨 왔다. 개인 오픈소스로 단독 배포하려면 외부 시스템 없이 앱만으로 로그인·소속이 돌아가야 한다. 요구: Google·GitHub 소셜 로그인, 허용 이메일 목록, 백엔드(FastAPI)는 지금처럼 Bearer JWT 로 자체 검증.

## 결정

1. **Better Auth** 를 Next.js 앱 안에 둔다 (`app/api/auth/[...all]`, `frontend/lib/auth/server.ts`).
   - DB 는 백엔드와 같은 Postgres, 테이블은 별도 스키마 **`auth`** (`database.schemaName`). 생성·갱신은 Better Auth CLI(`make auth-migrate`), Alembic 은 `auth` 스키마를 무시한다(`backend/alembic/env.py`).
   - 소셜 제공자는 `*_CLIENT_ID`/`*_CLIENT_SECRET` 이 모두 있을 때만 켠다.
   - `ALLOWED_EMAILS` 가 있으면 `user.validateUserInfo`(가입·연결·OAuth 재로그인) + `databaseHooks.session.create.before`(모든 세션 발급)에서 목록 밖 이메일을 거부한다. 백엔드도 같은 목록으로 403 (이중 방어). 비어 있으면 누구나 가입한다.
   - `AUTH_DEV_PASSWORD_LOGIN=true` 이고 `NODE_ENV≠production` 일 때만 이메일+비밀번호 로그인(로컬·E2E). 운영에선 플래그가 있어도 무시하고 에러 로그를 남긴다.
2. **백엔드 신뢰 = Better Auth JWT 플러그인.**
   - 흐름: 브라우저 —(세션 쿠키, httpOnly)→ BFF(`/api/v1/*` route) —`auth.api.getToken()`→ 5분짜리 RS256 JWT —`Authorization: Bearer`→ FastAPI —`AUTH_JWKS_URL`(= `/api/auth/jwks`)→ 서명·`iss`·`aud`·`exp` 검증.
   - 키는 RS256(기존 python-jose 검증 코드 재사용). 모르는 `kid` 면 JWKS 를 다시 받되 30초에 한 번까지.
   - `AUTH_ISSUER`·`AUTH_AUDIENCE` 는 필수 (`BETTER_AUTH_URL`). 비어 있으면 503 이지 "검증 생략"이 아니다. dev 우회 키·세션 헤더 경로는 없다.
3. **사용자·소속은 로컬 DB 가 원천 (임시 설계).**
   - 첫 인증 요청에서 `users` 를 JWT `sub` 로 upsert (email·name·image).
   - 소속은 `user_company_memberships` 만 본다. 하나도 없으면 개인 워크스페이스(`companies.id = personal-{sub}`, "{이름}의 워크스페이스")를 만들고 admin 으로 넣는다. ID 가 결정적이고 `ON CONFLICT DO NOTHING` 이라 동시 첫 요청에도 하나만 생긴다.
   - 그 밖의 소속은 회사 admin 이 이메일로 추가/제거(`POST/DELETE /api/v1/companies/{id}/members`, 대상은 한 번 이상 로그인한 사용자).
   - System Admin = `users.is_system_admin` OR `SYSTEM_ADMIN_EMAILS`.

## 대안

- **게이트웨이 세션 유지**: 외부 시스템 의존이 그대로 남는다. 탈락.
- **Auth.js(NextAuth)**: 백엔드용 토큰 발급·JWKS 노출을 직접 짜야 한다. Better Auth 는 JWT 플러그인이 `/token`·`/jwks` 를 제공.
- **백엔드가 Better Auth 세션 테이블을 직접 조회**: 백엔드가 Better Auth 스키마에 결합되고 서버 간·데스크톱 호출에 같은 자격 증명을 못 쓴다.
- **Better Auth organization 플러그인으로 소속 관리**: 소속이 프론트 DB 스키마로 옮겨가 백엔드 권한 판단과 이중화된다. 지금은 기존 로컬 테이블을 원천으로 둔다.

## 결과

- 로그아웃은 세션 삭제 → BFF 가 새 JWT 를 못 받는다. 이미 발급된 JWT 는 최대 5분 유효 (sid revocation·OIDC back-channel logout 은 폐기, ADR-0003).
- 백엔드는 네트워크로 JWKS 를 받는다. 테스트는 프로세스마다 RSA 키를 만들고 JWKS 조회만 대체한다 (`backend/tests/conftest.py`).
- 데스크톱·서버 간 클라이언트도 Better Auth JWT 를 Bearer 로 보내면 된다 (발급 흐름은 클라이언트 이전 때 결정 — 예: 세션 토큰 + `GET /api/auth/token`).
- 개인 워크스페이스 자동 생성과 이메일 기반 멤버 추가는 조직·초대 모델을 다시 설계할 때 바뀔 수 있다.
