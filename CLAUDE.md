# Ashfield Drive: Claude Code 규칙

이 프로젝트의 도메인 언어는 [CONTEXT.md](CONTEXT.md), 아키텍처 결정은 [docs/adr/](docs/adr/),
전체 구현 spec은 [SPEC.md](SPEC.md) 참조.

## 모노레포

```
frontend/  ← Next.js 16 + Better Auth (규칙: frontend/CLAUDE.md)
backend/   ← FastAPI + SQLAlchemy + Alembic (규칙: backend/CLAUDE.md)
```

## 절대 규칙

- **인증 = Ashfield 계정 서버(OIDC) SSO** (ADR-0024, 계약은 ashfield-account `docs/adr/0001`). 프론트 Better Auth 는 계정 서버의 `genericOAuth` 클라이언트(provider `ashfield`)일 뿐: 세션과 계정 토큰 테이블은 Postgres 스키마 `auth` (`make auth-migrate`). BFF 가 계정 서버 액세스 토큰(만료 전 refresh)을 `Authorization: Bearer` 로 백엔드에 전달, 백엔드는 `AUTH_JWKS_URL`(계정 서버 JWKS), iss, aud 로 검증. 로그인 수단, 허용 이메일, DEV 비밀번호는 계정 서버 설정. 인증 우회 모드 없음.
- **워크스페이스 소속의 원천은 계정 서버**: 앱은 토큰 `workspaces` 클레임으로 로컬 `workspaces`, `user_workspace_memberships` 를 동기화(캐시)한다. 앱에서 멤버를 추가하거나 제거하지 않는다 (계정 서버 `/workspaces/{id}` 링크).
- **로컬 포트**: Account 3300, Calendar 3100/8100, Drive 3200/8200 (3000, 19000 은 쓰지 말 것). 표는 docs/local-dev.md.
- **프록시가 붙이는 신원 헤더(`X-Forwarded-User` 등)를 보안 판단에 쓰지 말 것**: 권위는 백엔드가 JWKS 로 검증한 JWT.
- **Alembic 마이그레이션 파일 직접 수정 금지**: fix-forward (새 revision으로만 변경).
- **Alembic 마이그레이션 파일 손으로 작성 금지**: 모델 수정 후 항상 `make migration msg="..."` (= `alembic revision --autogenerate`) 사용. `op.create_table`/`op.add_column` 등을 손으로 적어 내려가지 말 것. 의도와 다르면 모델 수정 후 재생성.
- **GitHub Actions 사용 금지**: Makefile + `.githooks/pre-push`로 통일. push 전 `make ci-local`.

## 커밋 메시지

한 줄. type(scope): 한국어 요약 권장.
```
feat(items): 항목 삭제 API 추가
fix(auth): JWT exp 검증 누락
chore(deps): Pretendard 1.4 업데이트
```

## 브랜치 / Push

- main 에 바로 push (PR, dev 브랜치 없음)
- 커밋 전 `git pull` 필수

## 새 ADR을 만들 때

세 가지가 모두 참일 때만 ADR 생성:
1. 되돌리기 어렵다 (코드 변경량 大)
2. 코드만 보면 "왜 이렇게?" 의문이 든다
3. 진짜 trade-off가 있었다 (대안이 여러 개)

위 셋 중 하나라도 빠지면 그냥 코드 주석 또는 PR 설명으로.

## 새 기능 추가 시 체크리스트

- [ ] testid 컨벤션 적용 (frontend/CLAUDE.md 참조)
- [ ] 로깅 카테고리 사용 (console.log / print 금지)
- [ ] 에러 처리: 기존 글로벌 핸들러 활용 (직접 try/except로 변환 X)
- [ ] 영향 받는 ADR 갱신 또는 신규
- [ ] `make ci-local` 통과

@AGENTS.md
