"use client"

import { useApiGet } from "@/lib/hooks/use-api"
import { cn } from "@/lib/utils"
import { formatBytes } from "@/lib/utils/format"

interface MyStorage {
  // 파일 + 버전 합계 (ADR-0022). 그중 버전 몫이 version_bytes_used.
  storage_bytes_used: number
  version_bytes_used: number
  storage_bytes_limit: number | null
  storage_pct: number | null
  workspace_bytes_limit: number | null
}

// 툴바의 본인 저장 사용량: 개인 한도 있으면 바 + "사용 / 한도", 없으면 사용량만.
export function StorageUsage({ className }: { className?: string }) {
  const { data } = useApiGet<MyStorage>("/api/v1/me/storage")
  if (!data) return null

  const { storage_bytes_used: used, storage_bytes_limit: limit, version_bytes_used: versions } = data
  const versionNote = versions > 0 ? `버전 ${formatBytes(versions)} 포함` : undefined
  if (limit == null) {
    return (
      <span
        className={cn("text-xs whitespace-nowrap text-muted-foreground tabular-nums", className)}
        data-testid="files-storage-usage"
        title={versionNote}
      >
        {formatBytes(used)} 사용
      </span>
    )
  }
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 100
  const over = used > limit
  return (
    <div
      className={cn("flex items-center gap-2.5 text-xs text-muted-foreground", className)}
      data-testid="files-storage-usage"
      title={versionNote}
    >
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            over ? "bg-rose-500 dark:bg-rose-400" : pct > 85 ? "bg-amber-500 dark:bg-amber-400" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="whitespace-nowrap tabular-nums">
        {formatBytes(used)} / {formatBytes(limit)}
      </span>
    </div>
  )
}
