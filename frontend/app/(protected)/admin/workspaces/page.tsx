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
        className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800"
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
        <Building2 size={20} className="text-gray-600" />
        <h1 className="text-2xl font-bold text-gray-900">워크스페이스 관리</h1>
      </header>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      ) : isLoading ? (
        <div className="text-sm text-gray-500">불러오는 중…</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table
            className="w-full text-sm"
            data-testid="admin-workspaces-list"
          >
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">워크스페이스</th>
                <th className="w-32 px-4 py-2 font-medium">멤버</th>
                <th className="w-32 px-4 py-2 font-medium">관리자</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.workspaces.map((c) => (
                <tr
                  key={c.id}
                  data-testid={`admin-workspaces-row-${c.id}`}
                  className="hover:bg-gray-50"
                >
                  <td className="px-4 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900">{c.name}</span>
                      <span className="text-xs text-gray-500">{c.id}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-gray-700">{c.member_count}</td>
                  <td className="px-4 py-2">
                    {c.admin_count === 0 ? (
                      <span
                        className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800"
                        data-testid={`admin-workspaces-row-${c.id}-no-admin`}
                      >
                        <AlertTriangle size={12} />
                        없음
                      </span>
                    ) : (
                      <span className="text-gray-700">{c.admin_count}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/admin/workspaces/${encodeURIComponent(c.id)}/members`}
                      data-testid={`admin-workspaces-row-${c.id}-manage`}
                      className="text-xs font-medium text-blue-600 hover:underline"
                    >
                      멤버 관리
                    </Link>
                  </td>
                </tr>
              ))}
              {data?.workspaces.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
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
