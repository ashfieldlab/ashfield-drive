"use server"

import { cookies, headers } from "next/headers"

import { DEV_TOKEN_COOKIE, GATEWAY_COOKIE, SKIP_AUTH } from "@/lib/auth-session"
import { COOKIE_DOMAIN, COOKIES } from "@/lib/cookies"

/**
 * 로그아웃. **이동할 주소를 반환한다: 여기서 redirect 하지 않는다.**
 *
 * Keycloak 프론트채널 로그아웃 주소는 외부 도메인이다. server action 의 redirect() 는
 * 클라이언트 라우터 내비게이션이라 외부 URL 이면 조용히 무시된다. 호출부가 받은 주소로
 * window.location 을 옮긴다.
 */
export async function signOutAction(): Promise<string> {
  const c = await cookies()
  // 다음 사용자 로그인 시 이전 회사로 X-Active-Company-Id 보내 403 나는 것 방지.
  c.delete(COOKIES.activeCompany)

  if (SKIP_AUTH) {
    c.delete(DEV_TOKEN_COOKIE)
    return "/login"
  }

  // 게이트웨이 /auth/logout 은 POST + JSON(end_session_url) 응답이다. 그 주소(Keycloak
  // 프론트채널 로그아웃)로 브라우저를 보내야 SSO 세션까지 끝난다.
  const gatewayUrl = (process.env.GATEWAY_URL || "").replace(/\/$/, "")
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")
  const sid = c.get(GATEWAY_COOKIE)?.value

  let endSessionUrl = ""
  if (gatewayUrl && sid) {
    try {
      const res = await fetch(`${gatewayUrl}/auth/logout`, {
        method: "POST",
        headers: {
          Cookie: `${GATEWAY_COOKIE}=${sid}`,
          // 서버 간 호출이라 Origin 이 없다. 게이트웨이 CSRF 검사가 Origin 을
          // ALLOWED_ORIGINS 와 대조하므로 이 앱 주소를 명시한다(게이트웨이에 등록 필요).
          ...(appOrigin ? { Origin: appOrigin } : {}),
        },
        cache: "no-store",
      })
      if (res.ok) {
        const body = (await res.json()) as { end_session_url?: string }
        endSessionUrl = body.end_session_url ?? ""
      }
    } catch {
      // 게이트웨이에 못 닿아도 아래에서 로컬 세션 쿠키를 만료시키므로 이 앱 기준 로그아웃은 된다.
    }
  }

  // ashfield_sid 는 게이트웨이가 부모 도메인(예: .example.com)으로 심는다. 도메인이 정확히 맞아야
  // 지워지므로 후보를 모두 시도한다(맞지 않는 것은 무해). 남으면 가드는 통과, API 는 401 로 갇힌다.
  if (sid) {
    const host = (await headers()).get("host")?.split(":")[0] ?? ""
    const parentDomain = host.includes(".") ? `.${host.split(".").slice(-2).join(".")}` : ""
    for (const domain of new Set([undefined, COOKIE_DOMAIN || undefined, parentDomain || undefined])) {
      c.set(GATEWAY_COOKIE, "", { maxAge: 0, path: "/", ...(domain ? { domain } : {}) })
    }
  }

  return endSessionUrl || "/login"
}
