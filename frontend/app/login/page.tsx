import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { APP } from "@/lib/apps"
import { isAccountProviderReady } from "@/lib/auth/server"
import { getServerSession } from "@/lib/auth/session"

import LoginForm from "./login-form"

export const dynamic = "force-dynamic"

interface LoginPageProps {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}

/**
 * 로그인: Ashfield 계정 서버(OIDC)로 보내는 버튼 하나 (ADR-0024).
 * 계정 서버에 이미 로그인돼 있으면 화면 없이 돌아온다(SSO). 오류(`?error=`)도 여기서 보여 준다.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { callbackUrl, error } = await searchParams
  // 복귀 목적지가 로그인 경로면 버린다: 꼬이면 callbackUrl 이 왕복마다 중첩 인코딩되며 폭주한다.
  const dest =
    callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") && !callbackUrl.startsWith("/login")
      ? callbackUrl
      : APP.home

  // 이미 로그인돼 있으면 바로 복귀.
  const session = await getServerSession(await headers())
  if (session) redirect(dest)

  return <LoginForm callbackUrl={dest} error={error} accountReady={await isAccountProviderReady()} />
}
