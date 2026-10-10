"use server"

import { cookies, headers } from "next/headers"

import { getAuth } from "@/lib/auth/server"
import { revokeAccountRefreshToken } from "@/lib/auth/session"
import { COOKIES } from "@/lib/cookies"
import { logger } from "@/lib/utils/logger"

/**
 * 로그아웃 (ADR-0024): 이동할 주소를 반환. 호출부가 받은 주소로 `window.location` 을 옮긴다.
 *
 *   1. 이 앱의 refresh_token 을 계정 서버에서 폐기
 *   2. Better Auth 세션 삭제 (쿠키 만료는 nextCookies 플러그인이 반영)
 *   3. 계정 서버 end_session_endpoint 주소(RP-initiated logout, id_token_hint +
 *      post_logout_redirect_uri=/login)를 돌려준다 → 계정 서버 세션까지 끝나 SSO 로 바로 재로그인되지 않는다.
 *      주소를 못 만들면 앱 로그아웃만 하고 /login.
 */
export async function signOutAction(): Promise<string> {
  const c = await cookies()
  // 다음 사용자 로그인 시 이전 회사로 X-Active-Company-Id 보내 403 나는 것 방지.
  c.delete(COOKIES.activeCompany)
  const h = await headers()
  try {
    const a = await getAuth()
    const session = await a.api.getSession({ headers: h })
    if (session) await revokeAccountRefreshToken(session.user.id)
    const res = await a.api.signOut({
      headers: h,
      body: { callbackURL: "/login", disableRedirect: true },
    })
    if (res.url) return res.url
  } catch (err) {
    // 이미 세션이 없으면 그대로 로그인 화면으로.
    logger.debug("sign_out_local_only", { category: "auth", detail: (err as Error).message })
  }
  return "/login"
}
