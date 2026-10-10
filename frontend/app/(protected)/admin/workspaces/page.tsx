"use client"

import Link from "next/link"
import { AlertTriangle, Building2 } from "lucide-react"

import { useAppContext } from "@/components/providers/app-context"
import { useApiGet } from "@/lib/hooks/use-api"

interface WorkspaceListItem {
  id: string
  name: string
  member_count: number
  admin_count: number
}

interface WorkspaceListResponse {
  workspaces: WorkspaceListItem[]
}

export default function AdminWorkspacesPage() {
  const { isSystemAdmin } = useAppContext()
  const { data, error, isLoading } = useApiGet<WorkspaceListResponse>(
    isSystemAdmin ? "/api/v1/admin/workspaces" : null,
  )

  if (!isSystemAdmin) {
    return (
      <div
        className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-6 text-sm text-amber-800 dark:text-amber-200"
        data-testid="admin-workspaces-no-permission"
      >
        워크스페이스 관리는 시스템 관리자만 접근할 수 있습니다.
      </div>
    )
  }

  return (
    <div
      className="h-full overflow-y-auto space-y-4 px-4 py-8 sm:px-6 lg:px-8"
      data-testid="admin-workspaces-page"
    >
      <header className="flex items-center gap-2">
        <Building2 size={20} className="text-muted-foreground" />
        <h1 className="text-2xl font-bold text-foreground">워크스페이스 관리</h1>
      </header>

      {error ? (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-700 dark:text-rose-300">
          불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      ) : isLoading ? (
        <div className="text-sm text-muted-foreground">불러오는 중…</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table
            className="w-full text-sm"
            data-testid="admin-workspaces-list"
          >
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">워크스페이스</th>
                <th className="w-32 px-4 py-2 font-medium">멤버</th>
                <th className="w-32 px-4 py-2 font-medium">관리자</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {data?.workspaces.map((c) => (
                <tr
                  key={c.id}
                  data-testid={`admin-workspaces-row-${c.id}`}
                  className="hover:bg-muted/50"
                >
                  <td className="px-4 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.id}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-foreground/80">{c.member_count}</td>
                  <td className="px-4 py-2">
                    {c.admin_count === 0 ? (
                      <span
                        className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-xs text-amber-800 dark:text-amber-200"
                        data-testid={`admin-workspaces-row-${c.id}-no-admin`}
                      >
                        <AlertTriangle size={12} />
                        없음
                      </span>
                    ) : (
                      <span className="text-foreground/80">{c.admin_count}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/admin/workspaces/${encodeURIComponent(c.id)}/members`}
                      data-testid={`admin-workspaces-row-${c.id}-manage`}
                      className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      멤버 관리
                    </Link>
                  </td>
                </tr>
              ))}
              {data?.workspaces.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    아직 활동한 워크스페이스가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
