# ADR-0016: E2E 암호화 보안 폴더 (Vault, 봉투 암호화 + 클라이언트 전용 복호화)

- **상태**: 결정 (2026-06-13)
- **컨텍스트 ADR**:
  - [0005](0005-storage-s3-compatible-presigned.md) S3 presigned URL: 암호문도 같은 경로로 오르내림
  - [0006](0006-single-nodes-table-tree.md) 단일 nodes 트리: vault 는 그 위의 속성
  - [0008](0008-permission-model-scope-then-share.md) Scope + FileShare: 권한 행과 키 행의 동기화 필요
  - [0015](0015-desktop-client.md) Desktop client: hydrate 파이프라인에 복호화 layer

## 컨텍스트

워크스페이스 요구사항: **특정 폴더/파일은 개발자·관리자조차 볼 수 없어야 한다.** 파일 소유자의
비밀번호 없이는 누구도 (DB + S3 전체를 들고 가도) 평문에 접근 불가. S3 에는 암호문만
저장되고, 복호화는 접근 끝단 (웹 브라우저 / 데스크톱 탐색기) 에서만 일어나야 한다.

서버측 암호화 (SSE, KMS) 는 이 요구를 충족 못 함: 서버가 키를 가지므로 관리자가
결국 풀 수 있다. 요구사항의 본질은 **E2E (end-to-end)**: 평문과 키 평문이 사용자
기기에만 존재.

## 결정

### 1. 봉투 암호화 키 체인

```
비밀번호 ─(argon2id+salt)→ KEK ─(AES 풂)→ 개인키 ─(RSA 풂)→ vault_key ─(AES 풂)→ {파일명, DEK} ─(AES 풂)→ 파일
```

| 키 | 단위 | 저장 |
|---|---|---|
| 비밀번호 | 사용자 | 저장 안 함 (머릿속) |
| salt | 사용자당 1 | DB 평문 (비밀 아님) |
| KEK = argon2id(비밀번호, salt) | 사용자당 1 | 저장 안 함 (매번 재계산) |
| 키쌍 (RSA-OAEP-4096) | 사용자당 1 | 공개키 평문 / 개인키는 `AES-GCM(KEK, 개인키)` |
| vault_key | 보안 폴더당 1 | `RSA(멤버 공개키, vault_key)`: 멤버 수만큼 |
| DEK | 파일당 1 | `AES-GCM(vault_key, DEK)` |
| 파일 내용 |: | S3 에 `AES-256-GCM(DEK, 파일)` 만 |

서버는 잠긴 재료의 보관·배달만. 암호화/복호화 연산은 전부 클라이언트
(웹 = WebCrypto, 데스크톱 = Rust crate).

### 2. 적용 단위: 보안 폴더 (Vault) opt-in

폴더를 "보안 폴더" 로 지정하면 그 서브트리 전체가 E2E. 파일 단위 지정은 없음
(UX 혼란 + 키 관리 폭발). Nextcloud E2EE / Cryptomator 와 같은 모델.

### 3. 파일명까지 암호화

DB 의 `name` 컬럼도 vault 내에서는 `AES(vault_key, 이름)` 암호문. 서버는 트리
구조 (parent_id) 와 크기·시각만 알고 이름을 모름. 정렬·이름 검색·중복 검사는
클라이언트 책임. 탐색기 placeholder 는 데스크톱이 이름을 풀어 생성하므로
사용자에게는 평문으로 보임.

### 4. 공유: 받는 사람 공개키로 vault_key 재포장

vault 멤버 추가 = 소유자 클라이언트가 `RSA(상대 공개키, vault_key)` 행 추가.
파일 재암호화 없음. DEK 는 vault_key 로 잠그므로 파일별 공유 행 불필요
(공유 단위 = vault 전체. 파일 단위 외부 공유는 후속 결정).

함의:
- **공유는 소유자(또는 기존 멤버)의 잠금 해제된 클라이언트에서만 가능**.
  관리자가 서버에서 권한만 부여하는 기존 FileShare 와 다름.
- **철회는 불완전**: wrapped key 행 삭제로 신규 접근은 막지만 이미 받아간
  평문/키는 회수 불가. 완전 철회가 필요하면 새 vault_key 로 재암호화 + 재배포.

### 5. 분실 정책: 복구 코드 (관리자 escrow 배제)

vault 활성화 시 256bit 복구 코드를 클라이언트에서 생성해 1회 표시 (인쇄 보관 안내).
개인키를 두 자물쇠로 이중 보관:

```
AES(KEK_비밀번호, 개인키)   ← 평소
AES(KEK_복구코드, 개인키)   ← 비밀번호 분실 시
```

복구 코드도 서버에 평문 저장 안 됨. **둘 다 잃으면 영구 손실**: 이것이
"관리자도 못 본다" 의 거울상임을 사용자 고지 (UI 명시).
관리자 마스터 키 (escrow) 는 요구사항과 모순이라 배제.

### 6. 포기하는 서버 기능 (E2E 영역 한정)

서버가 평문을 못 보므로 vault 내에서는: OnlyOffice 미리보기·편집 / 서버측
이름·내용 검색 / 썸네일 / zip 일괄 다운로드 / 내용 기반 스캔 불가.
편집은 다운로드 → 로컬 편집 → 재업로드 (데스크톱 클라이언트가 이 사이클을
탐색기 경험으로 흡수).

## DB 스키마 (개요)

```
e2e_user_keys   (user_sub PK, salt, public_key,
                 enc_private_key, enc_private_key_recovery)
vaults          (node_id PK → nodes.id, workspace_id, created_by)
vault_members   (vault_id, user_sub, wrapped_vault_key)   -- 공유 = 행 추가
-- nodes: vault 내 파일은 name=암호문(base64), node_deks 불필요
--        (DEK 는 파일 메타에 wrapped_dek 컬럼 또는 별도 테이블)
```

## 대안 비교

| 옵션 | 관리자 차단 | 공유 | 구현 부담 | 비고 |
|---|---|---|---|---|
| S3 SSE / KMS | ✗ (서버가 키 보유) | 쉬움 | 0 | 요구 미충족 |
| 비밀번호로 파일 직접 암호화 | ✓ | ✗ (비밀번호 공유 불가) | 小 | 비밀번호 변경 = 전체 재암호화 |
| **봉투 암호화 (본 결정)** | ✓ | ✓ (재포장) | 中 | 업계 표준 (Proton/Cryptomator) |
| Cryptomator 통합 | ✓ | 제한적 | 中 | 우리 권한 모델과 불일치 |

## 결과

### 위협 모델 한계 (정직하게)

- **웹 클라이언트의 신뢰**: 복호화 JS 를 서버가 배포하므로, 악의적 운영자가
  백도어 스크립트를 심으면 뚫림. 서명된 바이너리인 데스크톱이 더 강함.
  (업계 공통 한계: 요구사항 문서에 명시)
- **메타데이터 노출**: 파일 크기·수정 시각·트리 모양·멤버 목록은 서버가 앎.
- **철회 불완전** (결정 4).

### 구현 단계 (Desktop Phase 2 이후 별도 트랙)

1. backend: e2e 키 테이블 + vault CRUD + wrapped key 배달 endpoint (서버는 연산 없음)
2. web: vault 생성/잠금해제 UI + WebCrypto 암복호 + 업로드/다운로드 파이프라인
3. desktop: hydrate 시 복호화 (S3 스트림 → AES-GCM 풀며 CfExecute), 업로드 시 암호화
4. 공유 UI + 복구 코드 흐름

Argon2id 파라미터 (시작점): memory 64MB, iterations 3, parallelism 4.
브라우저 (wasm) 에서 ~0.5초.
