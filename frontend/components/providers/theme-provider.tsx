"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * 테마(시스템, 라이트, 다크) = next-themes. html 에 `.dark` 클래스를 붙이고 선택은 localStorage `theme` 에 둔다.
 * 라이브러리 provider 라 AppContext 와 별개 (frontend/CLAUDE.md 상태 관리 참조).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
