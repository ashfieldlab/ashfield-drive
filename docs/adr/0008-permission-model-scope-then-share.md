# 권한 모델: scope-first → FileShare → ExternalLink 단계 도입

권한은 세 층으로 점진 도입. 각 층은 이전 층의 superset.

## 1차: scope만 (Phase 1)

`nodes.scope` 컬럼이 1차 권한:
- `personal`: owner == me
- `shared`: workspace 멤버 모두

워크스페이스 admin이 다른 멤버의 personal 폴더에 접근: **불가**. impersonate 기능은 없다 (예전엔 Keycloak impersonate 를 상정했으나 ADR-0023 으로 Keycloak 을 없앴다).

→ Phase 1은 이게 전부. 코드 단순, 권한 체크 = `scope` + `owner_id` + `workspace_id` 검사.

## 2차: FileShare (Phase 1.5)

내부 사용자에게 명시적 공유. `file_shares (node_id, grantee_sub, permission, granted_by, granted_at, expires_at?)`.

**상속**: 폴더에 share 걸리면 자손 자동 적용. 권한 체크 시 recursive CTE로 ancestor 권한 합산. 자손에 별도 grant 가능 (additive).

상속 없는 "직접 share만"은 사용자에게 의미 없음: 폴더 공유의 본질이 자손 접근이라.

## 3차: ExternalLink (Phase 1.5)

익명·외부 사용자에게 링크 공유. `external_links (token, expires_at?, password_hash?, permission, access_count, ...)`.

워크스페이스 간 공유는 ExternalLink 외엔 안 함: 계정 간 직접 공유는 보안 복잡. 외부 링크가 충분.

## 권한 체크 dependency 패턴

`require_node_access(node_id, permission='read')`: files와 동일 dependency 패턴, calendar는 `require_event_access`로 별도. 다른 워크스페이스 node 접근 시 403이 아닌 **404 반환** (존재 자체 마스킹).

## Audit (Phase 1)

`audit_logs` 테이블에 mutation만 기록 (create/update/delete/restore/share/unshare). read는 기록 안 함 (양 많음). 외부 링크 접근은 actor_type='external_link'로 기록.
