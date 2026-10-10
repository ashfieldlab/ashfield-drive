"use client"

import { useAppContext } from "@/components/providers/app-context"

/**
 * Active company 결정 전 children 렌더 차단.
 *
 * AppContext 가 session → JWT claims → companies → activeCompanyId 부트스트랩
 * 하는 사이에 child 가 useApiGet 발사하면 require_active_company 필요한
 * endpoint 가 X-Active-Company-Id 헤더 누락으로 422.
 *
 * bootstrapped=true && activeCompanyId 가 있어야 children 렌더.
 * companies=0 인 사용자는 AppContext 가 /access-denied 로 redirect 하므로
 * 여기는 안전망 메시지만.
 */
export function ActiveCompanyGate({ children }: { children: React.ReactNode }) {
  const { bootstrapped, activeCompanyId } = useAppContext()

  if (!bootstrapped) {
    return (
      <div
        className="flex h-screen items-center justify-center text-sm text-gray-500"
        data-testid="active-company-gate-loading"
      >
        준비 중…
      </div>
    )
  }
  if (!activeCompanyId) {
    // AppContext 가 곧 /access-denied 로 redirect — 깜빡 안 보이게 빈 화면.
    return null
  }
  return <>{children}</>
}
