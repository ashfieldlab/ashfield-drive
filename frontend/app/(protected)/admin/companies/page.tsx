"use client"

import Link from "next/link"
import { AlertTriangle, Building2 } from "lucide-react"

import { useAppContext } from "@/components/providers/app-context"
import { useApiGet } from "@/lib/hooks/use-api"

interface CompanyListItem {
  id: string
  name: string
  member_count: number
  admin_count: number
}

interface CompanyListResponse {
  companies: CompanyListItem[]
}

export default function AdminCompaniesPage() {
  const { isSystemAdmin } = useAppContext()
  const { data, error, isLoading } = useApiGet<CompanyListResponse>(
    isSystemAdmin ? "/api/v1/admin/companies" : null,
  )

  if (!isSystemAdmin) {
    return (
      <div
        className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800"
        data-testid="admin-companies-no-permission"
      >
        회사 관리는 시스템 관리자만 접근할 수 있습니다.
      </div>
    )
  }

  return (
    <div
      className="h-full overflow-y-auto space-y-4 px-4 py-8 sm:px-6 lg:px-8"
      data-testid="admin-companies-page"
    >
      <header className="flex items-center gap-2">
        <Building2 size={20} className="text-gray-600" />
        <h1 className="text-2xl font-bold text-gray-900">회사 관리</h1>
      </header>
      <p className="text-xs text-gray-500">
        한 번 이상 활동한 회사만 표시됩니다. 관리자가 0명인 회사는 설정을 변경할
        수 없으니, 최소 한 명을 임명해주세요.
      </p>

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
            data-testid="admin-companies-list"
          >
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">회사</th>
                <th className="w-32 px-4 py-2 font-medium">멤버</th>
                <th className="w-32 px-4 py-2 font-medium">관리자</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.companies.map((c) => (
                <tr
                  key={c.id}
                  data-testid={`admin-companies-row-${c.id}`}
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
                        data-testid={`admin-companies-row-${c.id}-no-admin`}
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
                      href={`/admin/companies/${encodeURIComponent(c.id)}/members`}
                      data-testid={`admin-companies-row-${c.id}-manage`}
                      className="text-xs font-medium text-blue-600 hover:underline"
                    >
                      멤버 관리
                    </Link>
                  </td>
                </tr>
              ))}
              {data?.companies.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                    아직 활동한 회사가 없습니다.
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
