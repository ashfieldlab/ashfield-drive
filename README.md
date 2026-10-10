# Ashfield Drive

멀티테넌트 파일 저장·공유 앱입니다 (가벼운 Nextcloud 대안). 워크스페이스(테넌트)마다 개인·공유 영역이 격리됩니다.
일정 앱 [ashfield-calendar](https://github.com/ashfieldlab/ashfield-calendar), Windows 동기화 클라이언트 [ashfield-sync](https://github.com/ashfieldlab/ashfield-sync) 와는 레포·DB 가 분리돼 있습니다.

문서: [CONTEXT.md](CONTEXT.md) (도메인 용어) · [docs/adr/](docs/adr/) (설계 결정) · [SPEC.md](SPEC.md) · [docs/local-dev.md](docs/local-dev.md) (로컬 실행)

## 구성

```
frontend/   Next.js 16 · React · Tailwind
backend/    FastAPI · SQLAlchemy 2.0 async · Alembic · arq 워커 · aioboto3
infra       Postgres · Redis · MinIO (S3 호환) · Mailpit   (docker compose, dev)
```

## 현재 상태

- 로그인은 [Ashfield 계정 서버](https://github.com/ashfieldlab/ashfield-account)(OIDC)를 통한 SSO 입니다. 한 번 로그인하면 Calendar·Drive 를 오갈 때 다시 로그인하지 않습니다 ([ADR-0024](docs/adr/0024-account-server-sso.md)).
- 워크스페이스 소속과 멤버 관리는 계정 서버가 맡고, 앱은 로그인 토큰으로 소속을 동기화합니다. 저장 한도는 앱에서 정합니다.
- 데스크톱 동기화 클라이언트(`ashfield-sync`)는 아직 계정 서버로 옮기지 않았습니다 (ADR-0015).

## 기능

- 업로드(대용량 멀티파트, 드래그 앤 드롭), 폴더, 이동·이름 변경, 휴지통
- 정렬, 유형 필터, 검색 (읽기 권한과 정확히 일치, ADR-0020)
- 사용자 공유와 외부 링크(권한, 만료, 비밀번호)
- 볼트: 종단 간 암호화 폴더 (ADR-0016), 파일 버전 (ADR-0022)
- 워크스페이스·사용자별 저장 한도, 알림(인앱, 이메일, 웹훅), 관리(SMTP, 감사 로그, 잡 모니터링)

## 로컬 개발

Ashfield 계정 서버(`ashfield-account`, http://localhost:3300)를 먼저 띄운 뒤 이 앱을 띄웁니다. 웹 3200, 백엔드 8200 을 씁니다.
설치 순서, 환경 변수, 포트 표, E2E 전제는 [docs/local-dev.md](docs/local-dev.md) 에 있습니다.

## 검증

```
make pytest        # 백엔드 테스트
make vitest        # 프론트 단위·스토리북 테스트
make e2e           # Playwright (계정 서버 필요, docs/local-dev.md)
make typecheck     # 프론트 타입 체크
make lint          # 프론트 eslint + 백엔드 ruff
make ci-local      # 위 전체 + 프론트 빌드
```

전체 명령은 `make help`.

## 라이선스

TBD.
