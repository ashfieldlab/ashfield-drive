/**
 * 인증 자격 증명 해석: 서버 사이드 단일 경로.
 *
 * 두 모드 (런타임 SKIP_AUTH 로 분기: 빌드타임 NEXT_PUBLIC 인라인에 안 걸린다):
 *   - SKIP_AUTH=true (로컬): dev 키로 서명한 JWT 를 httpOnly 쿠키(dev_token)에 둔다.
 *     로그인 = dev 사용자 선택 → /api/auth/dev-login. BFF 가 Bearer 로 백엔드에 전달.
 *   - 그 외 (운영): 게이트웨이가 Keycloak 로그인·세션(ashfield_sid)을 관리한다. BFF 는 그 값을
 *     X-Ashfield-Session-ID 헤더로 백엔드에 **직접** 전달하고(게이트웨이 프록시 경유 X),
 *     백엔드가 게이트웨이 /auth/me 에 신원을 묻는다.
 *
 * BFF 가 토큰을 만들지 않는 이유: 게이트웨이는 access_token 을 클라이언트에 내주지 않는다.
 */

import "server-only"

import { COOKIE_PREFIX } from "@/lib/env"

export const SKIP_AUTH = process.env.SKIP_AUTH === "true"

/** 게이트웨이 세션 쿠키 이름. 게이트웨이의 SESSION_COOKIE_NAME 과 같아야 한다. */
export const GATEWAY_COOKIE = process.env.GATEWAY_SESSION_COOKIE_NAME || "ashfield_sid"

/** dev 모드 로그인 토큰 쿠키 (dev 서명 JWT 그대로). */
export const DEV_TOKEN_COOKIE = `${COOKIE_PREFIX}dev_token`

/** dev 토큰 수명(초). JWT exp 와 쿠키 Max-Age 가 같은 값을 써야 한다. */
export const DEV_TOKEN_TTL_SECONDS = 60 * 60 * 8

/** 게이트웨이 세션 ID 를 백엔드로 나르는 헤더. 백엔드 get_current_user 가 읽는다. */
export const SESSION_ID_HEADER = "X-Ashfield-Session-ID"

type CookieJar = { get(name: string): { value: string } | undefined }

/** 이 요청을 백엔드에 인증시킬 헤더. 미인증이면 null. */
export function resolveAuthHeaders(cookies: CookieJar): Record<string, string> | null {
  if (SKIP_AUTH) {
    const token = cookies.get(DEV_TOKEN_COOKIE)?.value
    return token ? { Authorization: `Bearer ${token}` } : null
  }
  const sid = cookies.get(GATEWAY_COOKIE)?.value
  return sid ? { [SESSION_ID_HEADER]: sid } : null
}

/** 페이지 가드용: 세션 쿠키 존재 여부 (신원 검증은 백엔드 책임). */
export function hasSessionCookie(cookies: CookieJar): boolean {
  return resolveAuthHeaders(cookies) !== null
}
