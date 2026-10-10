# Tenancy 는 로컬 DB 멤버십으로 결정한다 (구: JWT groups + lazy upsert 캐시)

## 개정 (2026-10, ADR-0024)

원천이 다시 외부로: **Ashfield 계정 서버**. 신원은 계정 서버 액세스 토큰(`sub`·`email`·`name`·`picture`), 소속은 토큰 `workspaces` 클레임이고
`users`·`companies`·`user_company_memberships` 는 그 캐시다 (클레임 해시가 바뀔 때만 동기화, `companies.account_workspace_id` 로 연결).
개인 워크스페이스 자동 생성·이메일 멤버 추가는 앱에서 없앴다. 아래 ADR-0023 개정 내용 중 소속 부분은 더 이상 유효하지 않다.

## 개정 (2026-10, ADR-0023)

예전 결정은 "사용자·회사·소속의 원천은 외부 IdP/디렉터리, 백엔드는 JWT `groups` 로 권한을 판단하고 `users`/`companies` 는 Redis throttle lazy upsert 캐시" 였다. 외부 IdP·디렉터리 없이 Better Auth 소셜 로그인만 쓰게 되면서 원천을 로컬 DB 로 옮겼다 (임시 설계: 조직·초대 모델을 다시 설계할 때 바뀔 수 있다).

## 현재 결정

- **신원**: 검증된 Better Auth JWT 의 `sub`·`email`·`name`·`image`. 첫 인증 요청에서 `users` 를 upsert 하고, 값이 바뀐 경우에만 다시 쓴다 (Redis throttle 없음).
- **소속**: `user_company_memberships` 가 유일한 원천. `get_current_user` 가 매 요청 조회해 `UserContext.groups` 를 채운다.
  - 활성 회사 검증: `X-Active-Company-Id` 헤더가 그 목록에 있어야 한다 (없으면 403).
  - 소속이 하나도 없으면 개인 워크스페이스 `personal-{sub}` 를 만들고 role `admin` 으로 넣는다 (결정적 ID + `ON CONFLICT DO NOTHING` → 멱등·동시 요청 안전).
  - 추가·제거는 회사 admin 이 이메일로 (`POST/DELETE /api/v1/companies/{id}/members`). 대상은 한 번 이상 로그인해 `users` 행이 있어야 한다.
- **회사 내 역할**: `user_company_memberships.role` (ADR-0010).
- **System Admin**: `users.is_system_admin` OR `SYSTEM_ADMIN_EMAILS`.

## 결과

- 소속 변경이 다음 요청에 바로 반영된다 (JWT 재발급을 기다리지 않음). 요청마다 SELECT 2회(사용자·멤버십).
- 가입 전 초대, 초대 메일, 조직 디렉터리 연동은 없다.
