/**
 * 이 앱이 set/read 하는 모든 cookie 의 단일 source.
 *
 * 규칙 (skeleton):
 *   - 모든 cookie 이름은 `COOKIE_PREFIX` (= `${ns}_`) 로 시작.
 *   - 자체 cookie 는 `COOKIES.*` 로 참조 (raw string 금지).
 *   - NextAuth cookie 는 `NEXTAUTH_COOKIES` 를 NextAuth({cookies}) 에 그대로 전달.
 *
 * 배경: 같은 localhost 에서 여러 앱(drive/calendar 등) dev 서버를 띄울 때
 * cookie 가 host 매칭 (port 무시) 으로 섞임. NextAuth session 까지 prefix 없으면
 * 다른 앱의 session 이 잡혀서 cross-app 인증 사고 가능.
 *
 * ⚠️ prefix 는 **개발 한정**: 운영에선 COOKIE_PREFIX="" 라 자체 cookie 는 평문이 되고,
 * NEXTAUTH_COOKIES 는 auth.ts 에서 운영 시 미사용(Auth.js 기본 `__Secure-`/`__Host-`).
 * 운영은 도메인 분리로 충돌이 없으므로 prefix 불필요. (자세한 근거는 lib/env.ts COOKIE_PREFIX.)
 */

import { COOKIE_PREFIX } from "@/lib/env"

// 서비스 간 공유용 cookie 도메인. 운영에서 `.example.com` 같은 부모 도메인을 주면
// 서브도메인(drive/calendar…)이 active_company 를 공유 → 한 서비스에서 회사 변경 시
// 다른 서비스가 (탭 포커스 시) 따라온다. 빈 값(기본·dev)이면 host-only (공유 안 함).
export const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || ""

const isProd = process.env.NODE_ENV === "production"

function opts(extra: Partial<CookieOpts> = {}): CookieOpts {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProd,
    ...extra,
  }
}

interface CookieOpts {
  httpOnly?: boolean
  sameSite?: "lax" | "strict" | "none"
  path?: string
  secure?: boolean
  maxAge?: number
}

// ── 앱 자체 cookie ────────────────────────────────────────────────────────
export const COOKIES = {
  /** 현재 활성 회사 (X-Active-Company-Id 헤더 source). */
  activeCompany: `${COOKIE_PREFIX}active_company`,
} as const

// ── NextAuth cookies ────────────────────────────────────────────────────
// NextAuth v5 가 사용하는 6 cookie 이름·옵션을 통째로 override.
// 새 NextAuth 가 cookie 를 추가하면 여기 같이 추가 (default 면 prefix 안 붙음).
export const NEXTAUTH_COOKIES = {
  sessionToken: {
    name: `${COOKIE_PREFIX}authjs.session-token`,
    options: opts(),
  },
  callbackUrl: {
    name: `${COOKIE_PREFIX}authjs.callback-url`,
    options: opts({ httpOnly: false }),
  },
  csrfToken: {
    name: `${COOKIE_PREFIX}authjs.csrf-token`,
    options: opts(),
  },
  pkceCodeVerifier: {
    name: `${COOKIE_PREFIX}authjs.pkce.code_verifier`,
    options: opts({ maxAge: 900 }),
  },
  state: {
    name: `${COOKIE_PREFIX}authjs.state`,
    options: opts({ maxAge: 900 }),
  },
  nonce: {
    name: `${COOKIE_PREFIX}authjs.nonce`,
    options: opts(),
  },
} as const
