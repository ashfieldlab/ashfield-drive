"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { useToast } from "@/components/ui-custom/use-toast"

import { useAppContext } from "@/components/providers/app-context"
import { apiDownload } from "@/lib/api-client"
import { useApiGet } from "@/lib/hooks/use-api"
import {
  actionLabel,
  actorDisplay,
  entityLabel,
  metaSummary,
} from "@/lib/utils/audit-format"
import { formatDateTime } from "@/lib/utils/format"

const ENTITY_OPTIONS: [string, string][] = [
  ["", "전체 유형"],
  ["node", "파일"],
  ["file_access", "열람"],
  ["workspace_membership", "멤버"],
  ["user_quota", "사용자 한도"],
  ["webhook", "웹훅"],
]

const ACTION_OPTIONS: [string, string][] = [
  ["", "전체 동작"],
  ["create", "생성"],
  ["update", "수정"],
  ["delete", "삭제"],
  ["restore", "복원"],
  ["share", "공유"],
  ["unshare", "공유 해제"],
  ["download", "다운로드"],
  ["preview", "미리보기"],
  ["version_download", "버전 다운로드"],
  ["zip_download", "폴더 zip 다운로드"],
  ["link_access", "외부 링크로 받음"],
]

interface AuditLogResponse {
  id: string
  workspace_id: string | null
  actor_sub: string | null
  actor_name: string | null
  actor_type: string
  action: string
  entity_type: string
  entity_id: string
  meta: Record<string, unknown>
  created_at: string
}

interface AuditLogListResponse {
  logs: AuditLogResponse[]
}

const ACTION_COLOR: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-800",
  update: "bg-blue-100 text-blue-800",
  delete: "bg-rose-100 text-rose-800",
  restore: "bg-amber-100 text-amber-800",
  share: "bg-violet-100 text-violet-800",
  unshare: "bg-gray-100 text-gray-700",
  empty_trash: "bg-rose-100 text-rose-800",
}

type Scope = "workspace" | "system"

export default function AuditPage() {
  const { isSystemAdmin, isWorkspaceAdmin } = useAppContext()
  const { toast } = useToast()
  const [scope, setScope] = useState<Scope>("workspace")
  const [entityType, setEntityType] = useState("")
  const [action, setAction] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [exporting, setExporting] = useState(false)

  const canView = isWorkspaceAdmin || isSystemAdmin

  // 필터 → 쿼리스트링. 워크스페이스 admin 은 항상 workspace scope.
  function buildParams(withLimit: boolean): string {
    const p = new URLSearchParams()
    p.set("scope", isSystemAdmin ? scope : "workspace")
    if (withLimit) p.set("limit", "200")
    if (entityType) p.set("entity_type", entityType)
    if (action) p.set("action", action)
    if (fromDate) p.set("from", new Date(`${fromDate}T00:00:00`).toISOString())
    if (toDate) p.set("to", new Date(`${toDate}T23:59:59`).toISOString())
    return p.toString()
  }

  const { data, error, isLoading } = useApiGet<AuditLogListResponse>(
    canView ? `/api/v1/audit?${buildParams(true)}` : null,
  )

  async function exportCsv() {
    setExporting(true)
    try {
      await apiDownload(
        `/api/v1/audit/export.csv?${buildParams(false)}`,
        "audit-log.csv",
      )
    } catch (e) {
      toast.error(`내보내기 실패: ${(e as Error).message}`)
    } finally {
      setExporting(false)
    }
  }

  if (!canView) {
    return (
      <div
        className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800"
        data-testid="audit-no-permission"
      >
        감사 로그는 관리자만 조회할 수 있습니다.
      </div>
    )
  }

  return (
    <div
      className="h-full overflow-y-auto space-y-4 px-4 py-8 sm:px-6 lg:px-8"
      data-testid="audit-page"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">감사 로그</h1>
        <div className="flex items-center gap-2">
          {isSystemAdmin && (
            <div
              className="inline-flex overflow-hidden rounded-md border border-gray-300 text-xs"
              data-testid="audit-scope-toggle"
            >
              <button
                onClick={() => setScope("workspace")}
                data-testid="audit-scope-workspace"
                className={`px-3 py-1.5 ${
                  scope === "workspace"
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                워크스페이스
              </button>
              <button
                onClick={() => setScope("system")}
                data-testid="audit-scope-system"
                className={`border-l border-gray-300 px-3 py-1.5 ${
                  scope === "system"
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                시스템
              </button>
            </div>
          )}
          <button
            onClick={exportCsv}
            disabled={exporting}
            data-testid="audit-export-csv"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Download size={13} />
            {exporting ? "내보내는 중…" : "CSV 내보내기"}
          </button>
        </div>
      </header>

      <div
        className="flex flex-wrap items-center gap-2"
        data-testid="audit-filters"
      >
        <select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          data-testid="audit-filter-entity"
          className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
        >
          {ENTITY_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          data-testid="audit-filter-action"
          className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
        >
          {ACTION_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          data-testid="audit-filter-from"
          className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
        />
        <span className="text-gray-400">~</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          data-testid="audit-filter-to"
          className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
        />
        {(entityType || action || fromDate || toDate) && (
          <button
            onClick={() => {
              setEntityType("")
              setAction("")
              setFromDate("")
              setToDate("")
            }}
            data-testid="audit-filter-clear"
            className="rounded px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
          >
            초기화
          </button>
        )}
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      ) : isLoading ? (
        <div className="text-sm text-gray-500">불러오는 중…</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="w-44 px-4 py-2 font-medium">시각</th>
                <th className="w-40 px-4 py-2 font-medium">행위자</th>
                <th className="w-24 px-4 py-2 font-medium">동작</th>
                <th className="w-32 px-4 py-2 font-medium">대상</th>
                <th className="px-4 py-2 font-medium">상세</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data?.logs ?? []).map((log) => {
                const actionColor =
                  ACTION_COLOR[log.action] ?? "bg-gray-100 text-gray-700"
                return (
                  <tr
                    key={log.id}
                    data-testid={`audit-row-${log.id}`}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-4 py-2 text-gray-600">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="px-4 py-2 text-gray-700">
                      {actorDisplay(log)}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${actionColor}`}
                      >
                        {actionLabel(log.action)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-700">
                      {entityLabel(log.entity_type)}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {metaSummary(log) || "-"}
                    </td>
                  </tr>
                )
              })}
              {(data?.logs ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-gray-500"
                    data-testid="audit-empty"
                  >
                    기록된 활동이 없습니다.
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
