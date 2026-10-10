import type { Metadata } from "next"
import localFont from "next/font/local"

import { AppProvider } from "@/components/providers/app-context"
import { SwrErrorBridge } from "@/components/providers/swr-error-bridge"
import { GlobalLoadingBar } from "@/components/ui-custom/global-loading-bar"
import { ConfirmProvider } from "@/components/ui-custom/use-confirm"
import { Toaster } from "@/components/ui/sonner"
import { env } from "@/lib/env"

import "./globals.css"

const pretendard = localFont({
  src: "../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "45 920",
})

export const metadata: Metadata = {
  title: env.appName,
  description: "Ashfield Drive. 회사 파일 저장·공유.",
  icons: {
    icon: [
      { url: "/icons/ashfield/favicon.ico", sizes: "any" },
      { url: "/icons/ashfield/favicon_32.png", type: "image/png", sizes: "32x32" },
      { url: "/icons/ashfield/favicon_16.png", type: "image/png", sizes: "16x16" },
      { url: "/icons/ashfield/favicon_192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/ashfield/favicon_512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/ashfield/apple-touch-icon.png", sizes: "180x180" }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // 인증 = Better Auth (ADR-0023). 앱엔 세션 프로바이더 없음: 신원은 AppContext(/api/v1/me).
  // 신원은 AppProvider 가 /api/v1/me(백엔드가 검증한 신원)에서 가져온다.
  return (
    <html
      lang="ko"
      className={`${pretendard.variable} h-full antialiased`}
    >
      <body className="h-full font-sans">
        <AppProvider>
          <ConfirmProvider>
            <SwrErrorBridge>
              <GlobalLoadingBar />
              {children}
            </SwrErrorBridge>
          </ConfirmProvider>
          <Toaster />
        </AppProvider>
      </body>
    </html>
  )
}
