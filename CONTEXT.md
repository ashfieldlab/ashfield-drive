# ashfield-drive

멀티테넌트 파일 SaaS. 파일 저장·공유 (Ashfield 계정 서버 SSO + FastAPI JWKS 검증 + Multi-tenant, ADR-0024). 일정은 별도 레포 ashfield-calendar (2026-10-08 분리).

회원가입·회사 등록·빌링·impersonate는 외부 시스템 책임 (ADR-0009). 본 서비스는 JWT 받아 처리만.

## Language

**Workspace**:
회사(Tenant) 안의 사용자가 보는 파일 영역. 한 사용자가 여러 회사에 속하면 회사 전환마다 다른 워크스페이스를 봄.
_Avoid_: "Drive", "Cloud" (혼동)

**Node**:
파일과 폴더의 공통 추상. 단일 `nodes` 테이블에 `kind: file | folder` 컬럼으로 구분 (ADR-0006).
_Avoid_: "Item", "Entry"

**File**:
실제 바이트를 가진 Node. S3-compatible storage에 저장. 메타데이터(이름·MIME·size·트리 위치)는 DB.
_Avoid_: "Document" (Office 편집 기능 의미 따로)

**Folder**:
다른 Node를 자식으로 둘 수 있는 Node. 트리 구조의 분기점. S3엔 폴더 개념 없음: DB에만 존재.
_Avoid_: "Directory"

**Scope**:
Node의 공유 범위: `personal` 또는 `shared`.
- `personal`: owner만 접근.
- `shared`: 같은 회사의 모든 멤버 접근.
자식 Node의 scope는 부모와 강제 일치.
_Avoid_: "Visibility", "Privacy"

**Personal Area**:
사용자가 자기만 보는 영역. `nodes.scope='personal' AND owner_id=me`. 회사 안에 있되 다른 멤버는 못 봄.

**Shared Area**:
회사 전 멤버가 공유하는 영역. `nodes.scope='shared'`. 회사 워크스페이스의 공통 공간.

**File Version (파일 버전)**:
File 의 과거 내용 한 벌. 같은 File 의 내용이 덮어써지거나 옛 버전으로 복원될 때 생긴다. 이름 변경·이동은 버전이 아니다. 같은 이름으로 새로 올린 파일과 데스크톱 싱크의 "충돌본"은 버전이 아니라 별개의 File 이다.
_Avoid_: "Revision", "사본"

**Trash**:
삭제됐지만 30일간 복원 가능한 상태. `nodes.deleted_at IS NOT NULL`. 30일 후 cron이 hard delete + S3 객체 삭제.
_Avoid_: "Recycle Bin"

**Vault (보안 폴더)** (설계 단계):
E2E 암호화가 적용된 Folder. 서브트리의 파일 내용·이름이 클라이언트에서만 복호화됨: 서버·관리자는 암호문만 봄 (ADR-0016). 멤버 추가 = 소유자 클라이언트의 vault_key 재포장 (서버가 대신 못 함). 비밀번호+복구코드 모두 분실 = 영구 손실. Vault 내에선 서버 검색·zip 불가.
_Avoid_: "암호화 폴더" (서버측 암호화 SSE 와 혼동), "비밀 폴더"

**FileShare** :
Node를 회사 내 특정 사용자에게 명시적으로 공유. `file_shares (node_id, grantee_sub, permission)`. 폴더 공유 시 자손에 자동 상속.

**ExternalLink** :
Node를 회사 밖 외부 사용자가 token URL로 접근. 만료·비밀번호 선택. readonly이 기본.

**Desktop Client** (`ashfield-sync`, 별도 repo):
Windows-only 데스크톱 sync 앱. 사용자 표시 이름 "Ashfield". ashfield-drive backend 의 클라이언트: 새 파일 시스템 X (ADR-0015).
- **VFS**: Windows Cloud Files API 의 placeholder + 필요 시 hydrate (OneDrive 패턴)
- **양방향 sync**: 양쪽 변경 시 충돌 사본 자동 (`foo (충돌본 2026-06-12 hostname).docx`)
- **변경 감지**: `GET /api/v1/nodes/changes?since=` delta polling 1분 (SSE 는 Phase 3 이후)
- **인증**: OAuth + PKCE → Windows Credential Manager
- **회사별 root**: multi-company 면 `~\회사A\`, `~\회사B\` 분리
- **Sync 범위**: Personal Area + Shared Area + FileShare 받은 것 (Trash / ExternalLink 제외)
- **Stack**: Tauri (JS UI + Rust), `windows-rs` crate, OpenAPI auto-generated client

_Avoid_: "Sync App" (모호), "Drive Client" (Drive 용어 회피)

**File Access (열람)**:
누군가 파일 내용을 받아 갈 수 있는 주소를 발급받은 사실. 다운로드·미리보기·버전 다운로드·폴더 zip·외부 링크 접근이 모두 열람이다. 실제로 받았는지는 알 수 없고, 발급 시점을 열람으로 본다. 회사 관리자만 보며 1년 보관한다.
_Avoid_: "조회 기록", "다운로드 로그" (미리보기·외부 링크까지 포함하므로)

**Audit Log**:
사용자·외부 링크의 mutation 행동 기록. `audit_logs`. create/update/delete/restore/share/unshare 만. read는 기록 안 함.

**Presigned URL**:
S3가 발급하는 단기 인증 URL. 우리 백엔드가 권한 확인 후 S3에 요청해 받음. 클라이언트가 그 URL로 S3와 직접 통신 (백엔드 대역폭 안 거침). 만료 짧음 (60s upload / 30s download).

**HR Event (인사 이벤트)**:
입사·퇴사·부서 이동처럼 사람과 회사의 관계가 바뀌었다는 사실. 인사 원천 시스템이 이 서비스에 명시적으로 알린다. 로그인 토큰의 회사 목록 변화는 인사 이벤트가 아니다.
_Avoid_: "멤버십 동기화", "자동 감지"

## Relationships

- **Workspace = 회사** (skeleton의 Company와 동일)
- 한 **User**는 1~N개의 **Workspace**(회사)에 속함 (`user_company_memberships`). 소속의 원천은 Ashfield 계정 서버: 가입 때 개인 워크스페이스가 생기고, 초대·역할은 계정 서버에서 관리한다. 앱은 토큰 `workspaces` 클레임으로 로컬 멤버십을 동기화한다 (owner·admin → admin, member → member, ADR-0024).
- 한 **Workspace** 안에 **Node**들이 트리 구조. 트리 루트는 사용자별 personal + 회사 shared (2종)
- **Node**는 정확히 한 부모를 가짐 (`parent_id`, NULL이면 루트)
- 자식 **Node**의 `scope`는 부모와 일치 (강제)
- 자식 personal **Node**의 `owner_id`는 부모와 일치 (강제). shared는 자유.
- **File**의 storage_key는 트리와 무관: `{company_id}/{file_uuid}` flat
- **FileShare** 는 **Node** ↔ **User** 명시 grant
- **ExternalLink** 는 **Node**에 1:N: 같은 노드에 여러 링크 가능

## Flagged ambiguities

- "**Workspace**"가 (1) 회사 단위 SaaS 워크스페이스 (2) 사용자가 보는 UI 영역 둘 다 의미 가능. 본 문서는 (1)을 기본으로 함. UI 측은 "현재 회사", "활성 회사"로 호칭.
- "**공유**"가 (1) Shared scope (회사 전체) (2) FileShare (개인 grant) (3) ExternalLink (외부 link) 셋 다 의미. 각 항목은 정확한 용어로 호칭 권장.
- "**소속**"과 "**퇴사**"를 구분한다. 소속(그 회사에 들어올 수 있는가)은 Ashfield 계정 서버가 정하고, 앱은 토큰 `workspaces` 클레임을 `user_company_memberships` 에 캐시한다 (ADR-0004, ADR-0024). 퇴사(인계 같은 뒷처리를 시작할 사건)는 HR Event 로만 판단한다. 퇴사 판단엔 토큰 claim 을 쓰지 않는다.
- "**Admin**" 이 (1) System Admin (`users.is_system_admin` 또는 `SYSTEM_ADMIN_EMAILS`) (2) `user_company_memberships.role='admin'` = Company Admin 두 축. UI 에서 "관리자"라고 단독 호칭 시엔 (1) 디폴트, "회사 관리자"는 (2).
- "**알림**" 이 (1) NotificationBell in-app (`Notification` 테이블) (2) 이메일 발송 (`send_for_event`) (3) Webhook 발송 세 채널 다 의미. emit 시 자동 fan-out 되도록 dispatcher 가 묶음, 직접 호출 X.
