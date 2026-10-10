import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { APP } from "@/lib/apps"
import { getServerSession } from "@/lib/auth/session"
import { devPasswordLoginEnabled, enabledSocialProviders } from "@/lib/auth/server"

import LoginForm from "./login-form"

export const dynamic = "force-dynamic"

interface LoginPageProps {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}

/**
 * 로그인 — Better Auth 소셜 로그인 (Google·GitHub, 설정된 것만 버튼 노출).
 * AUTH_DEV_PASSWORD_LOGIN=true(비운영)면 이메일+비밀번호 dev 로그인도 노출. ADR-0023.
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

  return (
    <LoginForm
      callbackUrl={dest}
      error={error}
      providers={enabledSocialProviders}
      devPasswordLogin={devPasswordLoginEnabled}
    />
  )
}
