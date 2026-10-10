# 외부 시스템 책임 분리: ashfield-drive는 인증 후 행동만 수행

> **개정 (2026-10, ADR-0023)**: 로그인은 앱 안의 Better Auth(Google, GitHub)로, 워크스페이스와 멤버십은 로컬 DB(첫 로그인 시 개인 워크스페이스, 워크스페이스 admin 이 이메일로 멤버 추가)로 옮겼다. 아래 표의 Keycloak, 외부 admin 도구, 외부 디렉터리 항목은 더 이상 해당하지 않는다. 빌링과 impersonate 미보유는 그대로다.

ashfield-drive는 **단독 SaaS가 아니라 외부 인증과 디렉터리에 기대는 서비스**다. 다음 책임은 외부 시스템이 진다:

| 영역 | 책임 주체 | 우리는 |
|------|----------|--------|
| 회원가입과 계정 관리 | Keycloak | JWT 받아 신뢰 |
| 워크스페이스(group) 등록과 멤버 관리 | 외부 admin 도구 | JWT.groups 그대로 반영 |
| 빌링, 구독, 플랜 | 외부 빌링 시스템 | 결제 정보 무관, 단지 "계정 있으면 사용 가능" |
| 사용자 impersonate | Keycloak admin 기능 | 우리 측 impersonate 기능 없음, 감사도 Keycloak 측 |
| 사용자 정지와 삭제 | 외부 admin 도구 + Keycloak | JWT revocation은 우리 측 처리 (skeleton ADR-0003) |
| 서비스별 사용 권한 | (Phase 후) JWT claim `services` | claim 검사 옵션 (skeleton TODO) |

## 우리가 하는 일

JWT 검증 + groups에서 워크스페이스 추출 + 데이터와 일정 격리 + audit log. 사용자가 JWT.groups가 비어있으면 → "워크스페이스 접근 권한이 없습니다" 안내 페이지로 차단. 워크스페이스 가입 요청 등은 외부 admin 도구로 안내.

## 의도된 결과

- ashfield-drive는 self-contained: 외부 API 호출은 Phase 1엔 0 (Keycloak JWKS 한 번 fetch 외).
- 새 서비스 추가 시 같은 패턴 적용: JWT만 신뢰. 게이트웨이와 중간 레이어 없음.
- 외부 시스템(빌링과 계정관리)의 책임 경계가 명확해 운영 시 사고 격리.

## 비교: Nextcloud

Nextcloud는 모든 책임 자체 보유 (가입, 워크스페이스, 빌링, sharing UI). 무겁고 옵션 많음. 우리는 의도적으로 좁힘: 워크스페이스 핵심 기능(파일, 일정, 공유)에 집중.
