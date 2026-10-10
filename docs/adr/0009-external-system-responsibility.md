# 외부 시스템 책임 분리: ashfield-drive는 인증 후 행동만 수행

ashfield-drive는 **단독 SaaS가 아니라 외부 인증·디렉터리에 기대는 서비스**다. 다음 책임은 외부 시스템이 진다:

| 영역 | 책임 주체 | 우리는 |
|------|----------|--------|
| 회원가입·계정 관리 | Keycloak | JWT 받아 신뢰 |
| 회사(group) 등록·멤버 관리 | 외부 admin 도구 | JWT.groups 그대로 반영 |
| 빌링·구독·플랜 | 외부 빌링 시스템 | 결제 정보 무관, 단지 "계정 있으면 사용 가능" |
| 사용자 impersonate | Keycloak admin 기능 | 우리 측 impersonate 기능 없음, 감사도 Keycloak 측 |
| 사용자 정지·삭제 | 외부 admin 도구 + Keycloak | JWT revocation은 우리 측 처리 (skeleton ADR-0003) |
| 서비스별 사용 권한 | (Phase 후) JWT claim `services` | claim 검사 옵션 (skeleton TODO) |

## 우리가 하는 일

JWT 검증 + groups에서 회사 추출 + 데이터·일정 격리 + audit log. 사용자가 JWT.groups가 비어있으면 → "워크스페이스 접근 권한이 없습니다" 안내 페이지로 차단. 회사 가입 요청 등은 외부 admin 도구로 안내.

## 의도된 결과

- ashfield-drive는 self-contained — 외부 API 호출은 Phase 1엔 0 (Keycloak JWKS 한 번 fetch 외).
- 새 서비스 추가 시 같은 패턴 적용 — JWT만 신뢰. 게이트웨이·중간 레이어 없음.
- 외부 시스템(빌링·계정관리)의 책임 경계가 명확해 운영 시 사고 격리.

## 비교 — Nextcloud

Nextcloud는 모든 책임 자체 보유 (가입·회사·빌링·sharing UI). 무겁고 옵션 많음. 우리는 의도적으로 좁힘 — 워크스페이스 핵심 기능(파일·일정·공유)에 집중.
