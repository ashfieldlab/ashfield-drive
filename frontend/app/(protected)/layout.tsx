import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { ActiveWorkspaceGate } from "@/components/layout/active-workspace-gate"
import { AppShell } from "@/components/layout/app-shell"
import { getServerSession } from "@/lib/auth/session"

// 모든 protected 페이지는 로그인 사용자 데이터 기반: static prerender 의미 없음.
// useSearchParams 같은 client hook 쓰는 페이지가 prerender 시 Suspense 필요 에러를
// 일으키므로 dynamic 강제 (Next.js 16 build error 회피).
export const dynamic = "force-dynamic"

// 브랜딩(탭 타이틀·PWA manifest·파비콘). manifest scope 는 "/".
export const metadata: Metadata = {
  title: "파일 - Ashfield",
  manifest: "/manifest-files.webmanifest",
  icons: {
    icon: [
      { url: "/icons/ashfield/favicon.ico", sizes: "any" },
      { url: "/icons/ashfield/favicon_32.png", type: "image/png", sizes: "32x32" },
      { url: "/icons/ashfield/favicon_16.png", type: "image/png", sizes: "16x16" },
      { url: "/icons/ashfield/appicon_192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/ashfield/appicon_512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/ashfield/apple-touch-icon.png", sizes: "180x180" }],
  },
}

// 인증 가드: proxy.ts(세션 쿠키 존재, 복귀 주소 보존) → 여기서 Better Auth 세션 유효성 재확인
// (만료·로그아웃된 쿠키면 /login). 앱 신원·워크스페이스는 /api/v1/me.
//
// ActiveWorkspaceGate: activeWorkspaceId 부트스트랩 끝나야 children 렌더. 안 그러면
// useApiGet 가 X-Active-Workspace-Id 헤더 없이 발사돼 422.
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(await headers())
  if (!session) redirect("/login")

  return (
    <div data-testid="protected-main">
      <AppShell>
        <ActiveWorkspaceGate>{children}</ActiveWorkspaceGate>
      </AppShell>
    </div>
  )
}
