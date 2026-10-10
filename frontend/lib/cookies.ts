/**
 * 이 앱이 set/read 하는 모든 cookie 의 단일 source.
 *
 * 규칙:
 *   - 자체 cookie 이름은 `COOKIE_PREFIX` (= `${ns}_`, 개발 한정) 로 시작, `COOKIES.*` 로 참조.
 *   - Better Auth 세션 cookie 는 `AUTH_COOKIE_PREFIX`(lib/env.ts) 로 Better Auth 가 직접 관리
 *     (https 면 `__Secure-` 자동). lib/auth/server.ts 의 advanced.cookiePrefix.
 *
 * 배경: 같은 localhost 에서 여러 앱(drive/calendar 등) dev 서버를 띄울 때 cookie 가 host 매칭
 * (port 무시) 으로 섞인다. 세션 cookie 이름까지 앱별로 달라야 cross-app 인증 사고가 없다.
 */

import { COOKIE_PREFIX } from "@/lib/env"

// 서비스 간 공유용 cookie 도메인. 운영에서 `.example.com` 같은 부모 도메인을 주면
// 서브도메인(drive/calendar…)이 active_workspace 를 공유 → 한 서비스에서 워크스페이스 변경 시
// 다른 서비스가 (탭 포커스 시) 따라온다. 빈 값(기본·dev)이면 host-only (공유 안 함).
export const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || ""

// ── 앱 자체 cookie ────────────────────────────────────────────────────────
export const COOKIES = {
  /** 현재 활성 워크스페이스 (X-Active-Workspace-Id 헤더 source). */
  activeWorkspace: `${COOKIE_PREFIX}active_workspace`,
} as const
