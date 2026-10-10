import type { Metadata } from "next"

import { ActiveCompanyGate } from "@/components/layout/active-company-gate"
import { AppShell } from "@/components/layout/app-shell"

// 모든 protected 페이지는 로그인 사용자 데이터 기반 — static prerender 의미 없음.
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

// 가드는 proxy.ts (middleware) 가 처리. 여기서 server-side auth() 호출하면
// NextAuth 의 token refresh 가 RSC 안에서 cookie write 시도 → Next.js 16 prod
// 차단. client-side useAppContext / useSession 이 추가 검증 담당.
//
// ActiveCompanyGate — activeCompanyId 부트스트랩 끝나야 children 렌더. 안 그러면
// useApiGet 가 X-Active-Company-Id 헤더 없이 발사돼 422.
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div data-testid="protected-main">
      <AppShell>
        <ActiveCompanyGate>{children}</ActiveCompanyGate>
      </AppShell>
    </div>
  )
}
