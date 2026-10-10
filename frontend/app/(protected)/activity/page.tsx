"use client"

import { useState } from "react"

import {
  ACTIVITY_SCOPES,
  ActivityTimeline,
  type ActivityScope,
} from "@/components/activity/activity-timeline"
import type { ActivityResponse } from "@/components/activity/types"
import { useAppContext } from "@/components/providers/app-context"
import { APP } from "@/lib/apps"
import { useApiGet } from "@/lib/hooks/use-api"
import { cn } from "@/lib/utils"

export default function ActivityPage() {
  const { authUser } = useAppContext()
  const [scope, setScope] = useState<ActivityScope>("all")
  const { data, error, isLoading } = useApiGet<ActivityResponse>(
    "/api/v1/me/activity?limit=200",
  )

  // 이 앱이 소유한 이벤트만 (파일 관련).
  const allowed = APP.entityTypes as readonly string[]
  const items = (data?.items ?? []).filter((it) => allowed.includes(it.entity_type))

  return (
    <div className="h-full overflow-y-auto px-4 py-8 sm:px-6 lg:px-8" data-testid="activity-page">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">활동 내역</h1>
          <div className="inline-flex rounded-lg border bg-muted/50 p-0.5 text-sm" role="tablist">
            {ACTIVITY_SCOPES.map((s) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={scope === s.key}
                data-testid={`activity-scope-${s.key}`}
                onClick={() => setScope(s.key)}
                className={cn(
                  "rounded-md px-3 py-1 text-muted-foreground transition-colors hover:text-foreground",
                  scope === s.key && "bg-background text-foreground shadow-sm",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </header>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            불러오지 못했습니다
          </div>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">불러오는 중</p>
        ) : (
          <ActivityTimeline items={items} meSub={authUser?.id ?? null} scope={scope} />
        )}
      </div>
    </div>
  )
}
