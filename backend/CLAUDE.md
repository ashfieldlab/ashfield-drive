# Backend 규칙 (FastAPI + SQLAlchemy 2.0 async)

루트 공통 규칙은 [`../CLAUDE.md`](../CLAUDE.md), spec은 [`../SPEC.md`](../SPEC.md) §3 참조.

## 인증과 세션

- **모든 보호 라우트는 `get_current_user` dependency 사용.** 직접 `request.headers["Authorization"]` 파싱 금지.
- **워크스페이스 컨텍스트 필요한 라우트는 `require_active_workspace`.** 직접 `X-Active-Workspace-Id` 헤더 읽기 금지.
- **System Admin 전용은 `require_admin`.**
- `X-Forwarded-User` 같은 프록시 신원 헤더 신뢰 금지. 자격 증명은 `Authorization: Bearer <계정 서버 액세스 토큰>` 하나: `AUTH_JWKS_URL`(계정 서버 JWKS)로 서명, `AUTH_ISSUER`(= ACCOUNT_URL, 정확히 일치), `AUTH_AUDIENCE`(이 앱 주소, 배열 aud 포함) 검증 (ADR-0024). 검증 생략, dev 우회 모드 없음.
- `get_current_user` 가 `users` upsert + 토큰 `workspaces` 클레임으로 워크스페이스와 멤버십 동기화(클레임 해시가 바뀐 경우만)까지 한다 (`app/auth/provisioning.py`). 라우트에서 따로 하지 말 것. 개인 워크스페이스 자동 생성과 허용 이메일 검사는 없다 (계정 서버 몫).

## DB / Alembic

- **마이그레이션 파일 직접 수정 금지.** fix-forward: 새 revision 만들기.
- **마이그레이션 파일 손으로 작성 금지.** 모델 수정 후 항상 `make migration msg="..."` (= `alembic revision --autogenerate`) 실행. `op.create_table`/`op.add_column` 등을 새 파일에 손으로 적어 내려가지 말 것. autogenerate 결과를 검토만: 의도와 다르면 모델 수정 후 재생성. 예외: 데이터 마이그레이션, rename, PostgreSQL 확장처럼 autogenerate가 못 잡는 변경만 빈 revision(`alembic revision -m "..."`)에 추가.
- `make migration msg="..."` 으로 autogenerate, 결과 검토 후 `make migrate`.
- 모델 추가 시 `app/models/__init__.py` 의 `__all__`에 등록 (alembic autogenerate 인식).
- 세션은 `Depends(get_db)`로 받음. 라우트가 commit 책임 안 짐 (`get_db`가 yield 후 commit).
- `users` / `workspaces` / `user_workspace_memberships` 는 계정 서버 토큰의 캐시다 (ADR-0024). 쓰는 곳은 `app/auth/provisioning.py` 뿐: 앱엔 멤버 추가와 제거 API 가 없다. `workspaces.account_workspace_id` = 계정 서버 워크스페이스 ID (NULL = 레거시 로컬 워크스페이스, 동기화가 건드리지 않음).
- Better Auth 테이블(스키마 `auth`)은 Alembic 관리 밖: `alembic/env.py` 가 무시. 건드리지 말 것.

## 멀티테넌트 격리

- **모든 도메인 쿼리는 `workspace_id` 필터 필수.**
- 활성 워크스페이스 외 데이터를 반환하면 격리 위반.
- admin 전용 라우트(전 워크스페이스 조회)는 `require_admin`이며, 명시적으로 workspace 필터 빼는 것 OK.
- 예제: `app/api/v1/items.py` 참고.

## 권한 분기 패턴

- 읽기/쓰기는 active workspace 범위.
- 본인 소유 데이터 vs 다른 사람 데이터: `owner_id == user.sub` 또는 `user.is_system_admin`.
- 워크스페이스 admin = `user_workspace_memberships.role == 'admin'` (ADR-0010). System Admin = `users.is_system_admin` OR `SYSTEM_ADMIN_EMAILS`.

## 로깅

- **`print()` 금지.** `from app.core.logging import logger` 사용.
- 카테고리 6종: `auth | authz | api | db | cache | biz`. 매 호출 `extra={"category": "..."}` 필수.
```python
logger.info("item_created", extra={"category": "biz", "id": item.id})
```
- `request_id`는 미들웨어가 ContextVar로 자동 주입: 명시 X.
- `LOG_CATEGORIES` 환경변수로 debug 출력 제어.
- 운영(ENVIRONMENT=production)은 JSON formatter, 개발은 컬러 텍스트.

## 예외 처리

- **`raise HTTPException(status_code, detail)`**: Exception 그대로 raise 금지.
- `ValidationError`는 글로벌 핸들러가 처리: 직접 try/except로 변환 X.
- 예상 못한 Exception은 글로벌 핸들러가 500 + request_id 응답.
- 비즈니스 에러는 적절한 4xx (400/403/404/409) 선택.

## 환경 변수

- `os.getenv` 직접 호출 금지. `app.core.config.settings` 사용.
- 새 변수 추가 시:
  1. `.env.example`(루트)에 키 + 주석 추가
  2. `app/core/config.py` `Settings` 클래스에 필드 추가
  3. 사용처는 항상 `settings.foo`로 import

## Token Exchange (외부 서비스 호출)

- 본 스켈레톤엔 미포함. 조직도와 HR 등 외부 서비스 호출 코드 추가 시점에 도입.
- 도입 시 패턴: 서비스가 자체 처리 (게이트웨이 X).
- 같은 패턴이 두 번째 등장 시 공통 OIDC 라이브러리로 추출.

## Tests

- `make pytest`: 전부 통과 상태 유지. 네트워크 불필요: 테스트가 RSA 키를 만들어 JWT 를 서명하고 JWKS 조회만 대체 (`tests/conftest.py`).
- 새 라우트 추가 시 `tests/test_{feature}.py` 최소 1개 + 권한 검증 1개.
- `auth_headers(sub, groups=..., roles=..., active_workspace=...)` 헬퍼 사용: 직접 JWT 만들지 말 것. 토큰은 계정 서버 모양(RS256, iss, aud 배열, picture). groups, roles 는 테스트 전용 `_test_seed` claim 으로 요청 직전에 DB 에 심긴다 (레거시 로컬 워크스페이스, 운영 코드는 모름). 실제 계정 워크스페이스 동기화는 `make_jwt(sub, seed=False, workspaces=[ws("id", "owner")])`.
- 멀티테넌트 격리 테스트는 도메인 라우트마다 권장.

## Redis 사용

- 현재 용도: 파일 이벤트 pub/sub 등. 인증 경로는 Redis 를 쓰지 않는다. 캐시 추가 시 키 prefix 명확히.
- `app.core.redis.get_redis()` 사용. 직접 클라이언트 생성 금지.
- 운영에선 Redis 다운이 부분 장애여야 함: 인증 자체는 동작.
