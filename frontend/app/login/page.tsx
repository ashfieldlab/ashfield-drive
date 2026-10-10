import { redirect } from "next/navigation"

import { APP } from "@/lib/apps"
import { SKIP_AUTH } from "@/lib/auth-session"

import DevLogin from "./dev-login"

export const dynamic = "force-dynamic"

interface LoginPageProps {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}

/**
 * 자체 로그인 화면 없음.
 *   - SKIP_AUTH(로컬): dev 사용자 선택 카드 → /api/auth/dev-login.
 *   - 운영: 게이트웨이 OIDC 로그인(/auth/login)으로 보내고 redirect_after 로 복귀시킨다.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { callbackUrl, error } = await searchParams
  // 복귀 목적지가 로그인 경로면 버린다: 꼬이면 callbackUrl 이 왕복마다 중첩 인코딩되며 폭주한다.
  const dest =
    callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") && !callbackUrl.startsWith("/login")
      ? callbackUrl
      : APP.home

  if (SKIP_AUTH) return <DevLogin callbackUrl={dest} error={error} />

  const gw = (process.env.GATEWAY_URL || "").replace(/\/$/, "")
  const appBase = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")
  // callback_mode=gateway: OIDC code 를 게이트웨이 자기 origin 으로 받게 한다. 이 앱은
  // /auth/callback 을 게이트웨이로 프록시하지 않으므로(인증만 차용, API 는 직결) 기본값
  // dynamic 이면 code 가 갈 곳이 없어 로그인 가드와 무한 왕복한다.
  const params = new URLSearchParams({
    redirect_after: appBase ? `${appBase}${dest}` : dest,
    callback_mode: "gateway",
  })
  redirect(`${gw}/auth/login?${params}`)
}
