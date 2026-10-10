# 게이트웨이 세션 차용 인증

- **상태**: 결정 (2026-10-08)
- **supersedes**: 이전의 엣지 인증안(nginx + oauth2-proxy, 미배포·폐기)
- **향후**: 이 경로는 Auth.js + Google/GitHub IdP 로 교체 예정이다.

## 컨텍스트

이전 엣지 인증안(nginx + oauth2-proxy)은 운영에 올라가지 못하고 폐기됐다. 웹 로그인·세션은 외부 인증 게이트웨이가 이미 담당하므로, "게이트웨이 세션 차용 + 백엔드 직결" 방식을 따른다.

## 결정

자격 증명 경로는 둘이다. 이후 인가 코드는 경로를 모른다(같은 claims 모양으로 수렴).

| 경로 | 누가 | 백엔드 검증 |
|---|---|---|
| `X-Ashfield-Session-ID` | 운영 웹. BFF 가 `ashfield_sid` 쿠키 값을 옮김 | 게이트웨이 `GET /auth/me` (30초 Redis 캐시) |
| `Authorization: Bearer` | 데스크톱 싱크(Keycloak 토큰), 로컬 dev 로그인(dev 키 JWT) | JWKS + sid revocation |

- 로그인: 프론트 `/login` → 게이트웨이 `/auth/login?callback_mode=gateway&redirect_after=<앱 주소>`.
- 로그아웃: server action 이 게이트웨이 `POST /auth/logout` → 응답의 Keycloak end-session 주소로 이동, `ashfield_sid` 를 후보 도메인 전부에서 만료.
- 로컬: `SKIP_AUTH=true`(런타임 서버 변수) → dev 사용자 카드. 게이트웨이 불필요.
- 게이트웨이 프록시(`/api/...`)는 쓰지 않는다. API 는 BFF → 백엔드 직결.
- 디렉터리 부서 조회: Bearer 면 외부 디렉터리 직접, 세션이면 게이트웨이 `/api/directory/method/*` 경유.

## 결과

- 게이트웨이 `ALLOWED_ORIGINS` 에 앱 주소 등록이 필요하다(로그아웃 CSRF, 로그인 복귀 주소).
- 게이트웨이 경유 외부 디렉터리 호출은 회사 컨텍스트가 게이트웨이 세션의 선택 회사로 고정된다. 활성 회사가 다른 그룹사면 부서 해석이 비어 그룹 공유가 안 보인다(닫힌 쪽 실패).
- 로그아웃 반영은 최대 30초 늦다(`/auth/me` 캐시).
- 회사 소속은 외부 디렉터리가 원천이다 (2026-10-09 보강). 게이트웨이 세션 경로에서 `/auth/me` 다음에 디렉터리 REST `/api/v1/me/context`(게이트웨이 `/api/directory/v1/me/context`, 게이트웨이가 교환 토큰을 붙인다)로 소속 회사(PK)와 표시 이름을 받아 같은 30초 캐시에 담는다. 실패하면 503 (빈 소속으로 튕기지 않게). `/auth/me` 의 `companies`(Keycloak 그룹)는 쓰지 않는다. Bearer 경로(데스크톱 싱크·서버 간)는 아직 Keycloak 그룹이다: 외부 디렉터리의 Bearer 경로를 검증하지 못했다.
- 회사 ID = 디렉터리 회사 PK. Company 는 회사명으로 PK 를 만들고 Keycloak 회사 그룹도 그 PK 로 만들어져 기존 데이터 키는 그대로 맞는다. 회사명이 편집되면 표시 이름만 외부 디렉터리 값으로 따라간다.
- 외부 디렉터리 레거시 메서드(`get_current_user`, `get_group_organization`)는 제거 예정이라 쓰지 않는다. 소속은 `/api/v1/me/context`, 부서 계열은 `/api/v1/companies/{PK}/organization`, 부서 목록은 `/api/v1/companies/{PK}/directory/departments` (모두 REST).
