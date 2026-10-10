"use server"

import { cookies, headers } from "next/headers"

import { auth } from "@/lib/auth/server"
import { COOKIES } from "@/lib/cookies"

/**
 * 로그아웃 — Better Auth 세션을 지우고(쿠키 만료는 nextCookies 플러그인이 반영) 이동할 주소를 반환.
 * 호출부가 받은 주소로 `window.location` 을 옮긴다 (하드 내비게이션으로 가드를 다시 태움).
 */
export async function signOutAction(): Promise<string> {
  const c = await cookies()
  // 다음 사용자 로그인 시 이전 회사로 X-Active-Company-Id 보내 403 나는 것 방지.
  c.delete(COOKIES.activeCompany)
  try {
    await auth.api.signOut({ headers: await headers() })
  } catch {
    // 이미 세션이 없으면 그대로 로그인 화면으로.
  }
  return "/login"
}
