"use client"

import { Activity as ActivityIcon } from "lucide-react"

import { APP } from "@/lib/apps"
import { useApiGet } from "@/lib/hooks/use-api"
import {
  actionLabel,
  describe,
  metaSummary,
  relativeTime,
} from "@/lib/utils/audit-format"
import { formatDateTime } from "@/lib/utils/format"

interface ActivityItem {
  id: string
  actor_sub: string | null
  actor_name: string | null
  action: string
  entity_type: string
  entity_id: string
  meta: Record<string, unknown>
  created_at: string
}

interface ActivityResponse {
  items: ActivityItem[]
}

const ACTION_COLOR: Record<string, string> = {
  create: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300",
  update: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300",
  delete: "bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300",
  restore: "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200",
  share: "bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-300",
  unshare: "bg-muted text-foreground/80",
  empty_trash: "bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300",
}

export default function ActivityPage() {
  const { data, error, isLoading } = useApiGet<ActivityResponse>(
    "/api/v1/me/activity?limit=100",
  )

  // 이 앱이 소유한 이벤트만 (파일 관련).
  const allowed = APP.entityTypes as readonly string[]
  const items = (data?.items ?? []).filter((it) =>
    allowed.includes(it.entity_type),
  )

  return (
    <div
      className="h-full overflow-y-auto space-y-4 px-4 py-8 sm:px-6 lg:px-8"
      data-testid="activity-page"
    >
      <header className="flex items-center gap-2">
        <ActivityIcon size={20} className="text-muted-foreground" />
        <h1 className="text-2xl font-bold text-foreground">활동 내역</h1>
      </header>

      {error ? (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-700 dark:text-rose-300">
          불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : items.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-input p-8 text-center text-sm text-muted-foreground"
          data-testid="activity-empty"
        >
          기록된 활동이 없습니다.
        </div>
      ) : (
        <ol className="overflow-hidden rounded-lg border border-border bg-card">
          {items.map((it) => {
            const sentence = describe(it)
            const summary = metaSummary(it)
            const actionColor =
              ACTION_COLOR[it.action] ?? "bg-muted text-foreground/80"
            return (
              <li
                key={it.id}
                data-testid={`activity-row-${it.id}`}
                className="border-b border-border/60 px-4 py-3 last:border-b-0 hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${actionColor}`}
                      >
                        {actionLabel(it.action)}
                      </span>
                      <span className="truncate text-foreground">{sentence}</span>
                    </div>
                    {summary && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {summary}
                      </p>
                    )}
                  </div>
                  <time
                    dateTime={it.created_at}
                    title={formatDateTime(it.created_at)}
                    className="shrink-0 text-xs text-muted-foreground/70"
                  >
                    {relativeTime(it.created_at)}
                  </time>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

