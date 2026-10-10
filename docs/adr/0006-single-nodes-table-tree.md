# 파일·폴더: 단일 `nodes` 테이블 + parent_id 트리 + scope 컬럼

File과 Folder를 별도 테이블로 분리하지 않고 **단일 `nodes` 테이블 + `kind: file|folder` 컬럼**으로 통합한다 (Linux inode 패턴). Nextcloud·Dropbox·Google Drive 모두 같은 모델.

**트리 구조**: `parent_id` self-reference. 루트는 `parent_id IS NULL`. 이동·rename은 한 row update — 폴더 안에 천 개 파일 있어도 비용 동일.

**Scope 컬럼**: `scope: 'personal' | 'shared'`. Phase 1 권한 모델의 토대.
- `personal`: owner만 접근. 자식은 부모 owner 강제.
- `shared`: 같은 회사 멤버 누구나 접근. 자식 owner는 자유 (다른 멤버가 만든 폴더 안에 추가 가능).
- 자식 scope는 부모 scope 강제 — 같은 scope 안에서만 트리 형성.

**ID**: UUID v7 (시간 정렬 + 분산 친화). PostgreSQL 17+ native 지원.

**S3 key는 트리와 무관**: 폴더는 DB에만 존재. 파일 storage_key는 `{company_id}/{file_uuid}` flat — 폴더 변경이 S3에 영향 없음.

**경로 표현**: parent_id만 사용. materialized_path 컬럼은 안 둠 (rename 시 cascade update 비용 회피). 검색에 path 필요해지면 Phase 2에 캐시 컬럼 추가.

**동일 폴더 내 동일 이름**: DB unique constraint로 금지. 충돌 시 자동 `(2).pdf` rename (Google Drive 패턴).

**휴지통**: `deleted_at` soft delete + 30일 후 hard delete cron. 폴더 삭제는 자손 cascade.

**대안 검토 (path-based)**: 폴더 rename = 자식 path 전부 update. 폴더 큰 경우 lock·성능 문제. 채택 안 함.
