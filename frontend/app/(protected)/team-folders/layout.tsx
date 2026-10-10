import type { Metadata } from "next"

// 부서 폴더 = 파일 앱의 일부 → 탭 파비콘과 제목을 'drive' 브랜드로 (사이드바 브랜드는 app-shell).
export const metadata: Metadata = {
  title: "부서 폴더",
  icons: {
    icon: [
      { url: "/icons/ashfield/favicon.ico", sizes: "any" },
      { url: "/icons/ashfield/favicon_32.png", type: "image/png", sizes: "32x32" },
      { url: "/icons/ashfield/favicon_16.png", type: "image/png", sizes: "16x16" },
      { url: "/icons/ashfield/appicon_192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/icons/ashfield/apple-touch-icon.png", sizes: "180x180" }],
  },
}

export default function TeamFoldersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
