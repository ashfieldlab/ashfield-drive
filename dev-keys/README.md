# Dev Keys

⚠️ **개발 전용 RSA 키 페어.** 운영 환경에 절대 사용 금지.

## 용도

SKIP_AUTH 모드에서 NextAuth Credentials provider가 dev JWT를 서명할 때 사용.
백엔드는 SKIP_AUTH=true일 때만 `public.pem`을 JWKS 캐시에 추가하여 검증.

흐름은 SPEC §2.1, §3.3 + ADR-0001 참조.

## 재생성 (필요 시)

```bash
cd dev-keys
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

## 안전 장치

- `NODE_ENV=production && SKIP_AUTH=true` → 프론트·백엔드 모두 부팅 차단 (RuntimeError)
- `dev-keys/private.pem`은 의도적으로 commit됨 — 운영 환경에선 사용 안 되므로 노출 위험 없음

## 키 정보

- 알고리즘: RS256
- 크기: 2048 bit
- kid: `dev-key-2026` (JWT 헤더에 박힘 — Phase 3에서 구현)
