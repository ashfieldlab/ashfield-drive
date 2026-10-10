# Tenancy는 JWT groups로 결정, 백엔드 users/companies는 lazy upsert 캐시

사용자·회사·membership의 source of truth는 외부 디렉터리(또는 다른 외부 IAM)다. 백엔드 DB가 이를 마스터로 들면 양방향 동기화 지옥에 빠진다. 따라서 권한 결정은 항상 JWT를 본다:

- 활성 회사 검증: 클라이언트가 `X-Active-Company-Id` 헤더로 전달, 백엔드는 JWT `groups` 배열에 포함되어 있는지 확인 (현재 Keycloak이 회사 코드 문자열 배열로 발급)
- 시스템 관리자: JWT `realm_access.roles`의 `admin` 클레임
- Membership 자체는 별도 테이블로 만들지 않음

다만 백엔드 DB에 `users`와 `companies` 테이블은 둔다 — 표시(예: Item의 owner 이름)와 외래키 join을 위해 어차피 필요하기 때문이다. 이 두 테이블은 권한 결정에 쓰이지 않고 캐시 역할만 한다.

캐시 갱신은 lazy upsert: `get_current_user` 의존성이 매 요청 호출되지만 실제 UPSERT는 Redis `SETNX sync:user:{sub} EX 300`으로 throttle하여 사용자당 5분에 1회만 일어난다. JWT 수명(=5분)과 동일한 신선도이고, Redis가 워커 간 공유 + 재시작 안전이므로 워커 메모리 dict 패턴의 단점(워커별 중복)을 피한다. 즉시 갱신이 필요하면 `DEL sync:user:{sub}`로 강제할 수 있다.

회사 정보 변경이 즉시 반영되어야 하는 시나리오(예: 권한 박탈)는 본 스켈레톤 범위에 없고, 필요한 프로젝트는 webhook 또는 짧은 JWT TTL로 별도 해결한다.
