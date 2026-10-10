"use client"

import { useAppContext } from "@/components/providers/app-context"

/**
 * Active workspace 결정 전 children 렌더 차단.
 *
 * AppContext 가 session → JWT claims → workspaces → activeWorkspaceId 부트스트랩
 * 하는 사이에 child 가 useApiGet 발사하면 require_active_workspace 필요한
 * endpoint 가 X-Active-Workspace-Id 헤더 누락으로 422.
 *
 * bootstrapped=true && activeWorkspaceId 가 있어야 children 렌더.
 * workspaces=0 인 사용자는 AppContext 가 /access-denied 로 redirect 하므로
 * 여기는 안전망 메시지만.
 */
export function ActiveWorkspaceGate({ children }: { children: React.ReactNode }) {
  const { bootstrapped, activeWorkspaceId } = useAppContext()

  if (!bootstrapped) {
    return (
      <div
        className="flex h-screen items-center justify-center text-sm text-gray-500"
        data-testid="active-workspace-gate-loading"
      >
        준비 중…
      </div>
    )
  }
  if (!activeWorkspaceId) {
    // AppContext 가 곧 /access-denied 로 redirect: 깜빡 안 보이게 빈 화면.
    return null
  }
  return <>{children}</>
}
