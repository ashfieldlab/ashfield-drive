"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Bell, Check } from "lucide-react"

import { api } from "@/lib/api-client"
import { useAppContext } from "@/components/providers/app-context"
import { useToast } from "@/components/ui-custom/use-toast"
import { relativeTime } from "@/lib/utils/audit-format"
import { formatDateTime } from "@/lib/utils/format"
import { renderNotification } from "@/lib/utils/notification-format"
import { APP } from "@/lib/apps"
import type {
  NotificationListResponse,
  NotificationResponse,
} from "@/lib/types/api"

const PAGE = 30

export default function NotificationsPage() {
  const { toast } = useToast()
  const { activeWorkspaceId } = useAppContext()

  const [items, setItems] = useState<NotificationResponse[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)

  // 이 앱 소유 알림만: 서버에서 entity_types 로 스코프.
  const entityParams = useCallback(() => {
    const allowed = APP.entityTypes as readonly string[]
    const p = new URLSearchParams({ limit: String(PAGE) })
    allowed.forEach((t) => p.append("entity_types", t))
    return p
  }, [])

  const load = useCallback(
    async (offset: number) => {
      const p = entityParams()
      p.set("offset", String(offset))
      const res = await api<NotificationListResponse>(
        `/api/v1/notifications?${p}`,
      )
      return res
    },
    [entityParams],
  )

  // 활성 워크스페이스 준비 후 첫 페이지 로드.
  useEffect(() => {
    if (!activeWorkspaceId) return
    let cancelled = false
    setLoading(true)
    setError(false)
    load(0)
      .then((res) => {
        if (cancelled) return
        setItems(res.notifications)
        setHasMore(!!res.has_more)
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [activeWorkspaceId, load])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const res = await load(items.length)
      setItems((prev) => [...prev, ...res.notifications])
      setHasMore(!!res.has_more)
    } catch (e) {
      toast.error(`실패: ${(e as Error).message}`)
    } finally {
      setLoadingMore(false)
    }
  }

  async function markOne(id: string) {
    try {
      await api(`/api/v1/notifications/${id}`, {
        method: "PATCH",
        body: { read: true },
      })
      setItems((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
        ),
      )
    } catch (e) {
      toast.error(`실패: ${(e as Error).message}`)
    }
  }

  async function markAll() {
    try {
      const p = new URLSearchParams()
      ;(APP.entityTypes as readonly string[]).forEach((t) =>
        p.append("entity_types", t),
      )
      await api(`/api/v1/notifications/mark-all-read?${p}`, { method: "POST" })
      const now = new Date().toISOString()
      setItems((prev) =>
        prev.map((n) => (n.read_at ? n : { ...n, read_at: now })),
      )
    } catch (e) {
      toast.error(`실패: ${(e as Error).message}`)
    }
  }

  const unread = items.filter((n) => !n.read_at).length

  return (
    <div
      className="h-full space-y-4 overflow-y-auto px-4 py-8 sm:px-6 lg:px-8"
      data-testid="notifications-page"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bell size={20} className="text-muted-foreground" />
          <h1 className="text-2xl font-bold text-foreground">알림</h1>
        </div>
        {unread > 0 && (
          <button
            onClick={markAll}
            data-testid="notifications-mark-all-read"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            모두 읽음
          </button>
        )}
      </header>

      {error ? (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-700 dark:text-rose-300">
          불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : items.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-input p-8 text-center text-sm text-muted-foreground"
          data-testid="notifications-empty"
        >
          알림이 없습니다.
        </div>
      ) : (
        <>
          <ul className="overflow-hidden rounded-lg border border-border bg-card">
            {items.map((n) => {
              const isUnread = !n.read_at
              const r = renderNotification(n)
              return (
                <li
                  key={n.id}
                  data-testid={`notifications-row-${n.id}`}
                  className={`border-b border-border/60 last:border-b-0 ${
                    isUnread ? "bg-blue-50/50 dark:bg-blue-950/30" : ""
                  }`}
                >
                  <Link
                    href={r.href}
                    onClick={() => isUnread && void markOne(n.id)}
                    data-testid={`notifications-row-${n.id}-link`}
                    className="flex items-start justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {r.title}
                      </p>
                      {r.subtitle && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {r.subtitle}
                        </p>
                      )}
                      <p
                        className="mt-1 text-[11px] text-muted-foreground/70"
                        title={formatDateTime(n.created_at)}
                      >
                        {relativeTime(n.created_at)}
                      </p>
                    </div>
                    {isUnread ? (
                      <span
                        className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500"
                        aria-label="안 읽음"
                      />
                    ) : (
                      <Check size={14} className="mt-0.5 shrink-0 text-muted-foreground/50" />
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>

          {hasMore && (
            <div className="flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                data-testid="notifications-load-more"
                className="rounded border border-input px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 disabled:opacity-50"
              >
                {loadingMore ? "불러오는 중…" : "더 보기"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
