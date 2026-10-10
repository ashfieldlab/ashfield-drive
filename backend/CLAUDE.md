# Backend 규칙 (FastAPI + SQLAlchemy 2.0 async)

루트 공통 규칙은 [`../CLAUDE.md`](../CLAUDE.md), spec은 [`../SPEC.md`](../SPEC.md) §3 참조.

## 인증·세션

- **모든 보호 라우트는 `get_current_user` dependency 사용.** 직접 `request.headers["Authorization"]` 파싱 금지.
- **회사 컨텍스트 필요한 라우트는 `require_active_company`.** 직접 `X-Active-Company-Id` 헤더 읽기 금지.
- **System Admin 전용은 `require_admin`.**
- `X-Forwarded-User` 같은 게이트웨이 신원 헤더 신뢰 금지. 자격 증명은 둘뿐 (ADR-0021): `Authorization: Bearer`(JWKS 검증) 또는 `X-Ashfield-Session-ID`(게이트웨이 `/auth/me` 로 검증, `app/auth/gateway_session.py`).
- Revocation 체크는 `get_current_user`가 이미 함 — 라우트에서 또 호출 X.

## DB / Alembic

- **마이그레이션 파일 직접 수정 금지.** fix-forward — 새 revision 만들기.
- **마이그레이션 파일 손으로 작성 금지.** 모델 수정 후 항상 `make migration msg="..."` (= `alembic revision --autogenerate`) 실행. `op.create_table`/`op.add_column` 등을 새 파일에 손으로 적어 내려가지 말 것. autogenerate 결과를 검토만 — 의도와 다르면 모델 수정 후 재생성. 예외: 데이터 마이그레이션·rename·PostgreSQL 확장처럼 autogenerate가 못 잡는 변경만 빈 revision(`alembic revision -m "..."`)에 추가.
- `make migration msg="..."` 으로 autogenerate, 결과 검토 후 `make migrate`.
- 모델 추가 시 `app/models/__init__.py` 의 `__all__`에 등록 (alembic autogenerate 인식).
- 세션은 `Depends(get_db)`로 받음. 라우트가 commit 책임 안 짐 (`get_db`가 yield 후 commit).
- `users` / `companies` 테이블은 lazy upsert 캐시. 직접 INSERT/UPDATE 금지 (ADR-0004).

## 멀티테넌트 격리

- **모든 도메인 쿼리는 `company_id` 필터 필수.**
- 활성 회사 외 데이터를 반환하면 격리 위반.
- admin 전용 라우트(전 회사 조회)는 `require_admin`이며, 명시적으로 company 필터 빼는 것 OK.
- 예제 — `app/api/v1/items.py` 참고.

## 권한 분기 패턴

- 읽기/쓰기는 active company 범위.
- 본인 소유 데이터 vs 다른 사람 데이터 — `owner_id == user.sub` 또는 `user.is_system_admin`.
- Company 내부 admin은 표준에 없음 ([`../CONTEXT.md`](../CONTEXT.md) Flagged ambiguities 참조).

## 로깅

- **`print()` 금지.** `from app.core.logging import logger` 사용.
- 카테고리 6종: `auth | authz | api | db | cache | biz`. 매 호출 `extra={"category": "..."}` 필수.
```python
logger.info("item_created", extra={"category": "biz", "id": item.id})
```
- `request_id`는 미들웨어가 ContextVar로 자동 주입 — 명시 X.
- `LOG_CATEGORIES` 환경변수로 debug 출력 제어.
- 운영(ENVIRONMENT=production)은 JSON formatter, 개발은 컬러 텍스트.

## 예외 처리

- **`raise HTTPException(status_code, detail)`** — Exception 그대로 raise 금지.
- `ValidationError`는 글로벌 핸들러가 처리 — 직접 try/except로 변환 X.
- 예상 못한 Exception은 글로벌 핸들러가 500 + request_id 응답.
- 비즈니스 에러는 적절한 4xx (400/403/404/409) 선택.

## 환경 변수

- `os.getenv` 직접 호출 금지. `app.core.config.settings` 사용.
- 새 변수 추가 시:
  1. `.env.example`(루트)에 키 + 주석 추가
  2. `app/core/config.py` `Settings` 클래스에 필드 추가
  3. 사용처는 항상 `settings.foo`로 import

## Token Exchange (외부 서비스 호출)

- 본 스켈레톤엔 미포함. 조직도·HR 등 외부 서비스 호출 코드 추가 시점에 도입.
- 도입 시 패턴: 서비스가 자체 처리 (게이트웨이 X).
- 같은 패턴이 두 번째 등장 시 공통 OIDC 라이브러리로 추출.

## Tests

- `make pytest` — 12개 예제 통과 상태 유지.
- 새 라우트 추가 시 `tests/test_{feature}.py` 최소 1개 + 권한 검증 1개.
- `auth_headers(sub, groups=..., roles=..., active_company=...)` 헬퍼 사용 — 직접 JWT 만들지 말 것.
- 멀티테넌트 격리 테스트는 도메인 라우트마다 권장.

## Redis 사용

- 현재 용도: revocation cache + lazy upsert throttle + 게이트웨이 `/auth/me` 30초 캐시(`gw_me:`). 캐시 추가 시 키 prefix 명확히.
- `app.core.redis.get_redis()` 사용. 직접 클라이언트 생성 금지.
- 운영에선 Redis 다운이 부분 장애여야 함 — 로그아웃 즉시성/upsert 최신성 영향만, 인증 자체는 동작.
