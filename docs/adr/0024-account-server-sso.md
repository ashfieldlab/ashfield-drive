# 로그인과 워크스페이스는 Ashfield 계정 서버(OIDC)에 맡긴다

상태: 채택 (2026-10). [ADR-0023](0023-better-auth-jwks.md) 의 로그인 수단(Google, GitHub, DEV 비밀번호), `ALLOWED_EMAILS`, 앱 JWT 플러그인, 개인 워크스페이스 자동 생성, 이메일 멤버 추가를 대체한다. Better Auth 를 앱 세션에 쓰고 백엔드가 JWKS 로 Bearer JWT 를 검증하는 구조는 유지한다.

계약(엔드포인트, 클라이언트, 토큰 클레임)은 계정 서버의 [ADR-0001](https://github.com/ashfieldlab/ashfield-account/blob/main/docs/adr/0001-account-server-contract.md) 이 원본이다.

## 배경

Calendar, Drive 가 각자 Better Auth 로 로그인하면 앱마다 따로 로그인해야 하고, 워크스페이스 소속도 앱마다 따로 관리된다. 스위트 공용 계정 서버(ashfield-account: Better Auth `oauth-provider` + `organization`)가 생겼으므로 SSO 와 소속의 원천을 그쪽으로 모은다.

## 결정

1. **앱의 Better Auth = 계정 서버의 OIDC 클라이언트** (`frontend/lib/auth/server.ts`).
   - `genericOAuth` provider `ashfield`: 디스커버리(`${ACCOUNT_URL}/.well-known/openid-configuration`), `client_secret_basic` + PKCE, scope `openid profile email offline_access`, **authorize, token, refresh 모두 `resource=${BETTER_AUTH_URL}`** (계정 서버가 JWT 액세스 토큰을 내주는 조건), id_token 은 디스커버리 JWKS 로 서명과 nonce 검증(`requireIdTokenVerification`).
   - 콜백 `${BETTER_AUTH_URL}/api/auth/callback/ashfield`: 계정 서버 `make seed` 가 등록한 redirect_uri 와 정확히 일치.
   - 로그인 화면은 "Ashfield 계정으로 로그인" 버튼 하나. 계정 서버 세션이 있으면 화면 없이 돌아온다(SSO).
   - 디스커버리는 인스턴스 초기화 때 한 번. 그때 계정 서버가 꺼져 있었으면 provider 가 빠지므로 `getAuth()` 가 10초 간격으로 인스턴스를 다시 만든다 (기동 순서에 덜 민감하게).
2. **BFF 는 계정 서버 액세스 토큰을 그대로 백엔드에 넘긴다** (`frontend/lib/auth/session.ts`).
   - 토큰은 Better Auth `account` 테이블(스키마 `auth`)에 있다. 만료 60초 전부터 refresh(`auth.api.refreshToken`)하고 새 토큰과 회전된 refresh_token 을 저장한다.
   - 계정 서버는 refresh_token 재사용을 감지하면 토큰 패밀리를 폐기한다 → 같은 계정의 갱신은 **프로세스 안에서 single-flight** 로 직렬화하고, 진입 후 DB 를 다시 읽어 이미 갱신됐으면 건너뛴다.
   - 갱신 실패(폐기, 만료, 연결 해제) → BFF 가 앱 세션을 지우고 401 → 클라이언트가 /login → 계정 서버로.
3. **백엔드는 계정 서버 JWKS 로 검증**: `AUTH_JWKS_URL=${ACCOUNT_URL}/api/auth/jwks`, `AUTH_ISSUER=${ACCOUNT_URL}`(정확히 일치), `AUTH_AUDIENCE=${BETTER_AUTH_URL}`(배열 `aud` 에 포함), RS256 만, 시계 오차 60초.
4. **소속은 토큰 `workspaces` 클레임의 캐시** (`backend/app/auth/provisioning.py`).
   - 클레임 해시(id, name, 앱 역할)가 `users.workspaces_claim_hash` 와 다를 때만 동기화: 보통의 요청은 SELECT 만.
   - 워크스페이스마다 `workspaces` 행을 `account_workspace_id`(unique)로 찾고, 없으면 `id = account_workspace_id = 워크스페이스 ID` 로 만든다. 이름이 바뀌면 갱신.
   - 멤버십 upsert, 역할 매핑 `owner`, `admin` → `admin`, `member` → `member`. 클레임에서 빠진 계정 워크스페이스의 멤버십은 삭제. `account_workspace_id` 가 NULL 인 기존(레거시) 워크스페이스 멤버십은 건드리지 않는다.
   - 기존 로컬 워크스페이스를 계정 워크스페이스에 잇고 싶으면 그 행의 `account_workspace_id` 를 채운다 (PK 는 그대로).
   - `X-Active-Workspace-Id` 는 여전히 로컬 `workspaces.id`.
5. **앱에서 없앤 것**: Google, GitHub provider, 앱 JWT 플러그인(`/api/auth/token`, `/jwks`), DEV 비밀번호 로그인, `ALLOWED_EMAILS`(프론트와 백엔드), 개인 워크스페이스 자동 생성, 워크스페이스 멤버 추가, 제거, 역할 변경 API(`POST`/`DELETE`/`PATCH /api/v1/workspaces/{id}/members…`)와 UI. 멤버 화면은 조회 + "멤버 관리는 Ashfield 계정에서"(`${ACCOUNT_URL}/workspaces/{id}`) 링크.
6. **로그아웃**: 앱 refresh_token 을 계정 서버 `revocation_endpoint` 로 폐기 → 앱 세션 삭제 → 계정 서버 `end_session_endpoint`(id_token_hint, `post_logout_redirect_uri=${BETTER_AUTH_URL}/login`)로 이동해 계정 서버 세션까지 끝낸다. 다른 앱(Calendar)의 세션과 토큰은 그대로다 (각자 만료, 로그아웃).

## 대안

- **앱마다 로그인 유지(ADR-0023)**: SSO 없음, 소속 이중 관리. 탈락.
- **백엔드가 매 요청 계정 서버 `/api/v1/workspaces` 조회**: 항상 최신이지만 모든 요청이 계정 서버에 의존. 클레임 캐시 + 필요 시 조회로 충분.
- **`workspaces.id` 를 워크스페이스 ID 로 바꾸는 PK 마이그레이션**: 기존 데이터의 FK 를 모두 옮겨야 한다. 별도 unique 컬럼으로 연결.
- **opaque 토큰 + introspection**: 즉시 폐기되지만 요청마다 계정 서버 호출. 계약상 JWT.
- **갱신 직렬화를 Redis 잠금으로**: 여러 프론트 인스턴스면 필요하다. 지금은 단일 인스턴스라 프로세스 내 single-flight.

## 결과

- 소속 변경(초대 수락, 제거, 역할, 이름)은 다음 토큰 갱신(≤ 15분) 또는 재로그인 때 반영된다. 제거된 멤버도 그 사이엔 기존 토큰으로 접근할 수 있다.
- 시스템 관리자 화면의 역할 변경(`PATCH /api/v1/admin/workspaces/{id}/members/{sub}`)은 남아 있지만 계정 워크스페이스에선 다음 클레임 변경 때 덮어써진다: 레거시 워크스페이스용.
- 앱 사용자 목록과 멤버 목록은 이 앱에 한 번 이상 접속한 사람만 담는다 (계정 서버 멤버 전체는 `GET /api/v1/workspaces/{id}/members`).
- 데스크톱 동기화 클라이언트(ashfield-sync)는 계정 서버의 `ashfield-sync` 공개 클라이언트로 같은 모양의 토큰(`aud` = Drive 주소)을 받아 BFF 에 Bearer 로 보내면 된다 (BFF 가 그대로 통과). 클라이언트 쪽 이전은 별도 작업.
- 프론트를 여러 인스턴스로 띄우면 refresh 직렬화를 인스턴스 간 잠금(예: Redis)으로 바꿔야 한다.
- 계정 서버가 내려가 있으면 새 로그인과 토큰 갱신이 실패한다 (갱신 실패 = 재로그인 요구).
