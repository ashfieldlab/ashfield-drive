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
  create: "bg-emerald-100 text-emerald-800",
  update: "bg-blue-100 text-blue-800",
  delete: "bg-rose-100 text-rose-800",
  restore: "bg-amber-100 text-amber-800",
  share: "bg-violet-100 text-violet-800",
  unshare: "bg-gray-100 text-gray-700",
  empty_trash: "bg-rose-100 text-rose-800",
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
        <ActivityIcon size={20} className="text-gray-600" />
        <h1 className="text-2xl font-bold text-gray-900">활동 내역</h1>
      </header>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      ) : isLoading ? (
        <p className="text-sm text-gray-500">불러오는 중…</p>
      ) : items.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500"
          data-testid="activity-empty"
        >
          기록된 활동이 없습니다.
        </div>
      ) : (
        <ol className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {items.map((it) => {
            const sentence = describe(it)
            const summary = metaSummary(it)
            const actionColor =
              ACTION_COLOR[it.action] ?? "bg-gray-100 text-gray-700"
            return (
              <li
                key={it.id}
                data-testid={`activity-row-${it.id}`}
                className="border-b border-gray-100 px-4 py-3 last:border-b-0 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${actionColor}`}
                      >
                        {actionLabel(it.action)}
                      </span>
                      <span className="truncate text-gray-900">{sentence}</span>
                    </div>
                    {summary && (
                      <p className="mt-1 truncate text-xs text-gray-500">
                        {summary}
                      </p>
                    )}
                  </div>
                  <time
                    dateTime={it.created_at}
                    title={formatDateTime(it.created_at)}
                    className="shrink-0 text-xs text-gray-400"
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

