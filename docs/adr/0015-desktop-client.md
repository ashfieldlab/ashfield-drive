# ADR-0015 — Desktop Client (Tauri + Windows Cloud Files API + OAuth + Delta Polling)

- **상태**: 결정 (2026-06-12)
- **컨텍스트 ADR**:
  - [0001](0001-nextauth-only-auth.md) NextAuth + Keycloak SSO 만 (→ [0023](0023-better-auth-jwks.md) 으로 대체)
  - [0005](0005-storage-s3-compatible-presigned.md) S3 presigned URL
  - [0008](0008-permission-model-scope-then-share.md) Scope + FileShare 권한 모델

> **개정 (2026-10, ADR-0023)**: Keycloak 을 없애고 웹 로그인을 Better Auth 로 옮겼다. 데스크톱 클라이언트(ashfield-sync)는 아직 옛 Keycloak Bearer 를 쓰므로 **지금은 백엔드 인증이 실패한다** — 이전 작업이 필요하다. 백엔드 쪽 계약은 그대로다: `Authorization: Bearer <JWT>` + `X-Active-Company-Id`, API 경로 불변. 바뀌는 것은 토큰 발급처뿐:
>
> 1. 로그인: 시스템 브라우저로 Better Auth 로그인. 네이티브 앱으로 자격 증명을 넘기는 흐름은 Better Auth `deviceAuthorization` 플러그인(RFC 8628 — `/api/auth/device/code`, `/api/auth/device/token`) 또는 앱 전용 콜백 + `bearer` 플러그인(세션 토큰을 Bearer 로) 중 택1 — 둘 다 아직 켜지 않았다.
> 2. 세션 토큰을 Windows Credential Manager 에 보관 (아래 3절의 refresh token 자리).
> 3. API 호출 전 `GET ${BETTER_AUTH_URL}/api/auth/token` (세션 토큰으로 인증) → 5분짜리 RS256 JWT. 만료되면 다시 받는다.
> 4. 그 JWT 로 `/api/v1/*` 호출 (프론트 BFF 는 외부 Bearer 를 그대로 통과, 또는 백엔드 직접). 백엔드는 `AUTH_JWKS_URL`(`/api/auth/jwks`)로 검증.
>
> 아래 3절의 Keycloak OAuth+PKCE 설명은 결정 당시 기록이다.

## 컨텍스트

현재 ashfield-drive 의 파일 접근은 **웹 브라우저** 뿐. 사용자가 다운로드–편집–업로드 사이클의 불편을 호소. 특히 **HWP 라운드트립** (OnlyOffice 미지원) + **큰 파일** + **오프라인 작업** 시 부담.

### 검토한 대안

- **WebDAV proxy (mount)** — 우리 작업 1주, 단 OS native mount quirks + 모든 binary 가 서버 통과 + 동시 협업 X
- **WebDAV Hybrid (메타 통과, binary 는 S3 redirect)** — 우리 작업 1주, 단 PUT redirect 클라이언트 호환성 ↓ (OS native mount fail 가능)
- **Nextcloud Desktop fork** — Nextcloud server 응답 호환 layer 만 2~3개월, GPL viral 의무, 우리 도메인과 불일치
- **rclone wrapper (Tauri GUI + rclone subprocess)** — 우리 작업 2~3주, 단 VFS / overlay icon 없음 (mount 또는 주기 sync 만)
- **자체 desktop sync client (Tauri + Cloud Files API)** ← **본 결정**

### 핵심 제약

- 타깃 사용자가 거의 **Windows** (한국 사기업/공공). macOS / Linux 작업은 ROI 미흡.
- 최종 목표 = **SaaS 외부 고객** (Phase 4). 영업 임팩트 = "데스크톱 sync 됩니다".
- 진실의 원천 = backend (이미 만들어진 시스템). 본 앱은 **클라이언트 only** — Outlook / Dropbox Desktop 의 위치.
- 우리 작업 부담 vs Daily driver UX 의 균형 — `Phase 1+2 = 2.5개월` MVP, Phase 3+4 는 외부 SaaS 단계에서.

## 결정

### 1. Tauri (JS UI + Rust backend) — Windows-only

UI 는 익숙한 JS/React, 시스템 통합은 Rust. `windows-rs` crate 가 Cloud Files API 호출. Electron 의 100MB+ binary 부담 대비 Tauri 는 ~10~20MB.

macOS / Linux 는 명시적 미지원. 후속 단계 결정 시 별도 ADR.

### 2. Cloud Files API (Windows native VFS) — Files On-Demand

`onlyoffice/documentserver` 같은 FUSE 기반이 아닌 Windows 의 native API. OneDrive / Dropbox 의 placeholder 패턴 그대로:

- 디스크에 placeholder 만 (~수 KB metadata)
- 사용자가 열면 hydrate (backend GET + S3 download + cache)
- 폴더 우클릭 "이 디바이스에 항상 유지" → mirror 모드
- "공간 확보" → cache 비움

Windows native 라 OS overlay icon (✓ ⏳ ☁️) 자동. Shell extension 별도 작업 불요.

### 3. OAuth + PKCE flow — Keycloak SSO 일관

CalDAV 같은 long-lived App Token 패턴 회피. 이유:
- 외부 SaaS 사용자에게 "토큰 발급 후 paste" UX 부적합
- Keycloak 이 이미 SSO — 같은 인증 모델 (ADR-0001) 일관성
- Refresh token rotation — 보안 ↑ (PC 도난 시 revoke 가능)

흐름:
1. 앱 첫 실행 → 시스템 브라우저 열기 → Keycloak 로그인
2. Refresh + Access token → Windows Credential Manager (`wincred` crate)
3. Access token 만료 시 background 자동 refresh

### 4. 양방향 sync + 충돌 사본

Phase 2 의 핵심 가치. Daily driver = 양방향 필수.

- 신규 / 수정 / 삭제 / 이름변경 / 이동 / 폴더생성 모두 backend 에 반영
- ETag (`If-Match`) 기반 optimistic locking
- 양쪽 동시 변경 시 충돌 사본 자동:
  - 패턴: `foo (충돌본 2026-06-12 user-DESKTOP-ABC).docx`
  - 사용자가 manual merge
- Dropbox / OneDrive / Nextcloud 의 표준 패턴

### 5. Delta endpoint + Polling 1분

Backend → Client 방향. SSE 도입은 Phase 3 이후.

**Backend 추가 작업**:

```python
# 새 endpoint
GET /api/v1/nodes/changes?since=<ISO timestamp>&company_id=<>
→ {
    "changes": [
      {
        "id": "...",
        "operation": "create|update|delete|move|access_revoked",
        "kind": "file" | "folder",
        "name": "...",
        "parent_id": "...",
        "scope": "personal" | "shared",
        "size": 1234,
        "etag": "...",
        "updated_at": "..."
      }
    ],
    "server_time": "..."
  }

# nodes 컬럼 추가
ALTER TABLE nodes ADD COLUMN etag VARCHAR(64);  # md5(content) 또는 incrementing version
```

권한 변경 (FileShare revoke, membership 종료 등) 도 `operation: "access_revoked"` 로 push → 클라이언트가 placeholder + cache 즉시 삭제.

### 6. Sync 범위 — Personal + Shared + FileShare 받은 것

CONTEXT.md 의 도메인 용어 그대로:
- Personal Area (`scope=personal, owner_id=me`)
- Shared Area (`scope=shared`, 회사 전체)
- FileShare 받은 것 (다른 사람이 나한테 명시 공유)

Trash 는 sync 제외 — Windows 휴지통과 혼동 방지. ExternalLink 는 외부 사용자용이라 desktop client 와 무관.

### 7. Multi-company → 회사별 root 폴더 분리

CalDAV 의 `(user_sub, company_id)` tuple 키 와 일관:
- `C:\Users\X\Ashfield\` (회사 1)
- `C:\Users\X\다른회사\` (회사 2 — 사용자가 두 회사 멤버면)

웹앱의 sidebar 구조와 1:1 매칭. 활성 회사 전환 개념 X — 둘 다 동시 sync.

### 8. Multi-device 자동 (backend device 구분 X)

같은 사용자가 회사 PC + 집 PC 두 대 sync OK. backend 는 device 정보 추적 안 함. 충돌 처리는 ETag + 충돌 사본으로 자동 해결.

Phase 4 (SaaS) 단계에서 device registration (admin 의 "이 디바이스 logout") 도입 검토.

### 9. 별도 repo `ashfield-sync`

Tauri build 흐름이 ashfield-drive (Next.js + FastAPI) 와 완전 분리. Release cycle 다름 (월 단위 vs 매 commit). 외부 배포 시 source 공개 별도 결정 가능.

Backend API ↔ Desktop 의 contract 는 **OpenAPI auto-generate** (FastAPI 의 `/openapi.json` → `openapi-generator` 로 Rust 자동 generate). Backend API 변경 시 desktop `cargo build` 가 컴파일 에러로 잡음.

### 10. MVP 단계 — Phase 1 + 2 (~2.5개월)

**Phase 1 — POC (~1개월)**: OAuth + 회사 root 선택 + VFS placeholder + hydrate + read-only + polling

**Phase 2 — 양방향 MVP (~1.5개월)**: 로컬 변경 감지 + 양방향 + 충돌 사본

**Phase 3 (외부 배포)**: tray icon + 자동 업데이트 + Windows Authenticode signing + onboarding wizard

**Phase 4 (SaaS)**: Multi-company UI + 다국어 + Sentry + device registration

MVP 도달 후 내부 검증 → Phase 3/4 진행 결정.

### 11. 사용자 표시 이름

"Ashfield" (한글). Root 폴더 default = `~\Ashfield\` 와 일관.

영문 표기 시 (메모 / repo) — `Ashfield` (회사명 영문 표기 정책 — 항상 대문자).

## 대안 비교

| 옵션 | 우리 작업 | UX | 한계 |
|---|---|---|---|
| WebDAV proxy mount | 1주 | OS mount, 익숙 | binary 서버 통과, 동시 협업 X, OS quirks |
| WebDAV Hybrid (S3 redirect) | 1주 | rclone 으로 mount | PUT redirect 호환성 ↓, OS native fail |
| Nextcloud Desktop fork | 2~3개월 | VFS + overlay 다 갖춤 | GPL viral, server 호환 layer 부담, 우리 모델 불일치 |
| rclone wrapper | 2~3주 | mount / sync | VFS X, overlay X |
| **Tauri + Cloud Files API (본 결정)** | **2.5개월 (MVP)** | **OneDrive 수준 native** | Windows-only, OAuth + signing 셋업 부담 |

## 결과

### 사용자 흐름

```
1. ashfield-sync 설치 (.msi)
2. 첫 실행 → 시스템 브라우저 → Keycloak SSO
3. 회사 선택 (멤버 1 회사면 자동) + 로컬 폴더 선택 (default `~\Ashfield\`)
4. 첫 sync — placeholder 생성. 큰 워크스페이스도 ~수 분
5. 탐색기에서 폴더 보임 — 익숙한 환경
6. 파일 클릭 → 자동 download → Word/Excel/한컴오피스 열림
7. 편집 → 저장 → 자동 upload (다른 PC / 다른 사용자에 1분 안에 반영)
```

### 운영 측면

- backend 새 endpoint 1개 (`/changes?since=`) + 컬럼 1개 (`nodes.etag`) — 약 2주 작업
- desktop 의 OpenAPI auto-generate — 작업 2~3일
- Windows Authenticode 인증서 — Phase 3 단계에서 발급 (수십만원/년)
- Tauri 의 자동 업데이트 — Phase 3 단계
- OS overlay icon / context menu = Cloud Files API 가 자동 — 별도 작업 X

### 보안

- Refresh token 보관 = Windows Credential Manager (Keychain 비슷)
- Cache 폴더 = `%LOCALAPPDATA%\Ashfield\cache\` — OS user 권한 격리
- 권한 변경 = `operation: access_revoked` 즉시 push → 클라이언트가 placeholder + cache 삭제

### 한계 / Trade-off

- **Windows-only** — macOS/Linux 사용자 미지원. 타깃 사용자 거의 다 Windows + 한국 시장 위주 가정. 잘못된 가정이면 후속 별도 ADR
- **Polling 1분 지연** — daily driver 에 OK. SSE 는 Phase 3 이후
- **Code signing 비용** — Phase 3 의 외부 배포 단계에서 인증서 발급 (Sectigo / DigiCert ~수십만원/년)
- **Cloud Files API 의 quirk** — Microsoft 의 documentation 빈약 + 정책 변경 잦음. Microsoft 의 CloudMirror sample 을 reference 로 검증 필요
