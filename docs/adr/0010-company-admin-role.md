# 회사 admin role: 우리 DB 의 `user_company_memberships.role`

> 개정 (2026-10, ADR-0023): 이제 System Admin 은 `users.is_system_admin` OR `SYSTEM_ADMIN_EMAILS`, 회사 멤버십 자체도 로컬 DB 가 원천이다 (ADR-0004). 첫 로그인 사용자의 **개인 워크스페이스**에서는 본인이 `admin` 으로 들어간다 (아래 "자동 admin 부여 안 함" 의 유일한 예외: 그 회사의 유일한 멤버이므로). 아래 본문의 Keycloak·JWT groups 언급은 결정 당시 맥락이다.

## 컨텍스트

지금까지 권한 모델은 두 단(段):

| 역할 | 출처 | 권한 |
|---|---|---|
| **System Admin** | Keycloak realm role `admin` (JWT `realm_access.roles`) | 감사로그·Webhooks 전역 |
| 일반 멤버 | 회사 멤버십 (JWT `groups`) | 자기 회사 데이터 |

회사 내부 admin 개념은 명시적으로 비워둠 (CONTEXT.md "Flagged ambiguities"). System Admin 이 곧 회사 admin 역할도 대행.

C 모델 SMTP override (전역 + 회사별) 도입 시 **회사 단위로 설정을 만지는 사람** 이 필요해짐. quota·회사 설정·향후 회사 멤버 초대 등도 같은 권한이 가져야 함 → **회사 admin** 신설.

## 결정

`user_company_memberships` 테이블에 `role` 컬럼 추가:

```python
role: Mapped[str] = mapped_column(
    String(16), nullable=False, server_default="member"
)
```

값: `'admin' | 'member'`. 기본 `'member'`.

권한 의사결정:

```
require_company_admin(company_id):
    is_system_admin == True                          → 허용 (super-set)
    OR membership(user_sub, company_id).role=='admin' → 허용
    else                                              → 403
```

**자동 admin 부여 안 함** (개인 워크스페이스 제외). 회사 admin 이 이메일로 추가한 멤버는 default `'member'`. System Admin·회사 admin 이 명시적 임명 UI 에서 승격.

이 결정으로 `user_company_memberships` 의 의미가 확장됨:
- (기존) JWT.groups 의 캐시: 검색·자동완성용 표시 목적
- (추가) **권한 결정에 사용되는 진실의 한 축**: `role` 컬럼은 캐시가 아니라 우리 DB 가 진실. JWT 가 변경돼도 role 은 유지.

## 대안

### Keycloak realm role 로 표현 (`company-admin-{id}`)

- 회사 N개 = role N개. realm role 카디널리티 폭증 (운영 UI 가 죽음)
- 모든 회사의 admin 인 사람은 JWT 에 회사 수만큼 role 박혀서 옴 → HTTP 헤더 크기 한계 근접
- 회사 생성·삭제마다 Keycloak Admin API 양방향 동기화: 일관성 깨질 위험
- 우리 앱 외 다른 RP 에서 의미 없음: 공유 가치 X

### 첫 로그인 멤버 = 자동 admin

- Keycloak group 에 신입사원 5명 일괄 추가 후 신입이 먼저 로그인 시 신입이 admin
- 보안 사고 가능성: 채택 안 함

### 별도 `company_admins` 테이블

- 멤버십과 role 이 1:1 인데 두 테이블로 쪼개면 join 비용 + 일관성 트리거 필요
- 컬럼 하나 추가가 자연

## 의도된 결과

- 회사 admin 임명·강등은 우리 DB 트랜잭션 안에서: Keycloak 무관, 즉시 반영
- System Admin 은 자동으로 모든 회사 admin 권한 보유: 회사 admin 부재 시에도 운영 가능
- 회사 admin 부여 UI 는 System Admin 메뉴 (별도 phase): 회사 admin 이 다른 admin 을 임명할지는 향후 결정
- JWT revocation 등 인증 측면은 무관

## 영향

- `app/auth/dependencies.py`: `require_company_admin(company_id)` 신규
- `app/models/user_company_membership.py`: `role` 컬럼 + 문서 갱신
- `app/api/v1/me.py`: 응답에 `company_roles: {company_id: role}` 추가
- 프론트 `useAppContext().isCompanyAdmin`: 활성 회사 기준 boolean

## 참고

- ADR-0023: Better Auth + JWKS (ADR-0001 대체)
- ADR-0004: 로컬 DB 멤버십 기반 멀티테넌트 (구: JWT.groups + lazy upsert)
- ADR-0008: scope-then-share 권한 모델 (회사 admin 은 별개 축)
