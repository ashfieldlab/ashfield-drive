"use client"

import { HardDrive } from "lucide-react"

import { useApiGet } from "@/lib/hooks/use-api"
import { formatBytes } from "@/lib/utils/format"

interface MyStorage {
  // 파일 + 버전 합계 (ADR-0022). 그중 버전 몫이 version_bytes_used.
  storage_bytes_used: number
  version_bytes_used: number
  storage_bytes_limit: number | null
  storage_pct: number | null
  company_bytes_limit: number | null
}

// 파일앱 내 본인 저장 사용량 — 개인 한도 있으면 바, 없으면 사용량만.
export function StorageUsage() {
  const { data } = useApiGet<MyStorage>("/api/v1/me/storage")
  if (!data) return null

  const { storage_bytes_used: used, storage_bytes_limit: limit, version_bytes_used: versions } = data
  const versionNote = versions > 0 ? ` (버전 ${formatBytes(versions)})` : ""
  if (limit == null) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-gray-500"
        data-testid="files-storage-usage"
      >
        <HardDrive size={13} className="text-gray-400" />
        {formatBytes(used)} 사용 중{versionNote}
      </span>
    )
  }
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 100
  const over = used > limit
  return (
    <div
      className="flex items-center gap-2"
      data-testid="files-storage-usage"
      title={`${formatBytes(used)} / ${formatBytes(limit)}${versionNote}`}
    >
      <HardDrive size={13} className="shrink-0 text-gray-400" />
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full ${over ? "bg-rose-500" : pct > 85 ? "bg-amber-500" : "bg-gray-700"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="whitespace-nowrap text-xs text-gray-500">
        {formatBytes(used)} / {formatBytes(limit)}{versionNote}
      </span>
    </div>
  )
}
