"use client"

import { useEffect, useState } from "react"
import { Database } from "lucide-react"
import { useToast } from "@/components/ui-custom/use-toast"

import { api } from "@/lib/api-client"
import { invalidateApi, useApiGet } from "@/lib/hooks/use-api"
import { formatBytes } from "@/lib/utils/format"

interface QuotaResponse {
  company_id: string
  storage_bytes_limit: number | null
  storage_bytes_used: number
  storage_pct: number | null
}

interface Props {
  companyId: string
  /** "admin" — System Admin 편집 모드. "view" — 읽기 전용. */
  mode: "admin" | "view"
}

/** 회사 스토리지 quota 게이지 + (admin 모드 시) 편집 폼. */
export function QuotaCard({ companyId, mode }: Props) {
  const { toast } = useToast()
  const url =
    mode === "admin"
      ? `/api/v1/admin/companies/${encodeURIComponent(companyId)}/quota`
      : `/api/v1/companies/${encodeURIComponent(companyId)}/quota`
  const { data, error, isLoading } = useApiGet<QuotaResponse>(url)

  // 입력값 — bytes 단위로 보여주면 너무 길어서 MB 단위. 0 == limit 강제 0(차단).
  const [limitMb, setLimitMb] = useState<string>("")  // "" = 무제한
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!data) return
    if (data.storage_bytes_limit === null) setLimitMb("")
    else setLimitMb(String(Math.round(data.storage_bytes_limit / 1_000_000)))
  }, [data])

  if (error)
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        저장소 사용량을 불러오지 못했습니다.
      </div>
    )
  if (isLoading || !data)
    return <div className="text-sm text-gray-500">불러오는 중…</div>

  const used = data.storage_bytes_used
  const limit = data.storage_bytes_limit
  const pct = data.storage_pct ?? 0
  const pctDisplay = Math.min(100, Math.round(pct * 100))
  const isOverflow = limit !== null && used > limit
  const isHigh = pctDisplay >= 80

  async function save() {
    setBusy(true)
    try {
      const bytes =
        limitMb === "" ? null : Math.max(0, Math.round(Number(limitMb) * 1_000_000))
      await api(url, { method: "PUT", body: { storage_bytes_limit: bytes } })
      toast.success("저장소 한도를 저장했습니다")
      invalidateApi(url)
    } catch (e) {
      toast.error(`저장 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="space-y-3 rounded-lg border border-gray-200 bg-white p-4"
      data-testid={`quota-card-${companyId}`}
    >
      <div className="flex items-center gap-2">
        <Database size={16} className="text-gray-600" />
        <h3 className="text-sm font-semibold text-gray-900">스토리지 사용량</h3>
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between text-xs">
          <span className="text-gray-600">
            {formatBytes(used)} /{" "}
            {limit === null ? "무제한" : formatBytes(limit)}
          </span>
          {limit !== null && (
            <span
              className={
                isOverflow
                  ? "font-medium text-rose-700"
                  : isHigh
                    ? "font-medium text-amber-700"
                    : "text-gray-500"
              }
            >
              {pctDisplay}%
            </span>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded bg-gray-100">
          <div
            className={`h-full transition-all ${
              isOverflow
                ? "bg-rose-500"
                : isHigh
                  ? "bg-amber-500"
                  : "bg-blue-500"
            }`}
            style={{ width: limit === null ? "0%" : `${pctDisplay}%` }}
          />
        </div>
        {isOverflow && (
          <p className="mt-1 text-xs text-rose-700">
            저장소 한도 초과. 새 업로드가 차단됩니다. 한도 상향 또는 휴지통 정리 필요.
          </p>
        )}
      </div>

      {mode === "admin" && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <label className="block text-xs font-medium text-gray-600">
            한도 (MB). 빈 값 = 무제한, 0 = 새 업로드 차단
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={limitMb}
              onChange={(e) => setLimitMb(e.target.value)}
              placeholder="무제한"
              data-testid="quota-card-limit-input"
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
              min={0}
            />
            <button
              onClick={save}
              disabled={busy}
              data-testid="quota-card-save-button"
              className="rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              저장
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
