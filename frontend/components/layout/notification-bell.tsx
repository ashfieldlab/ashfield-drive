"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Bell, Check } from "lucide-react"

import { api } from "@/lib/api-client"
import { useApiGet } from "@/lib/hooks/use-api"
import { useAppContext } from "@/components/providers/app-context"
import { useToast } from "@/components/ui-custom/use-toast"
import { relativeTime } from "@/lib/utils/audit-format"
import { formatDateTime } from "@/lib/utils/format"
import { renderNotification } from "@/lib/utils/notification-format"
import { APP } from "@/lib/apps"
import type { NotificationListResponse } from "@/lib/types/api"

export function NotificationBell() {
  const { toast } = useToast()
  const { activeCompanyId } = useAppContext()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 활성 회사(쿠키) 준비 후에만 호출 — 첫 로그인 레이스로 X-Active-Company-Id 누락 →
  // 422 ("입력 정보를 다시 확인해주세요") 토스트 뜨는 것 방지.
  const { data, mutate } = useApiGet<NotificationListResponse>(
    activeCompanyId ? "/api/v1/notifications?limit=20" : null,
    { refreshInterval: 30_000 },
  )
  // 이 앱 소유 알림만. 뱃지도 같은 스코프.
  const allowed = APP.entityTypes as readonly string[]
  const items = (data?.notifications ?? []).filter((n) =>
    allowed.includes(n.entity_type),
  )
  const unread = items.filter((n) => !n.read_at).length

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("mousedown", onClick)
    return () => window.removeEventListener("mousedown", onClick)
  }, [open])

  async function markAll() {
    try {
      // 이 앱 알림만 읽음 처리.
      const params = new URLSearchParams()
      allowed.forEach((t) => params.append("entity_types", t))
      await api(`/api/v1/notifications/mark-all-read?${params}`, {
        method: "POST",
      })
      void mutate()
    } catch (e) {
      toast.error(`실패: ${(e as Error).message}`)
    }
  }

  async function markOne(id: string) {
    try {
      await api(`/api/v1/notifications/${id}`, {
        method: "PATCH",
        body: { read: true },
      })
      void mutate()
    } catch (e) {
      toast.error(`실패: ${(e as Error).message}`)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        data-testid="notification-bell"
        className="relative rounded p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        aria-label="알림"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span
            data-testid="notification-unread-badge"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="notification-panel"
          className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <h3 className="text-sm font-semibold text-gray-900">알림</h3>
            {unread > 0 && (
              <button
                onClick={markAll}
                data-testid="notification-mark-all-read"
                className="text-xs text-gray-500 hover:text-gray-900"
              >
                모두 읽음
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">
              알림이 없습니다.
            </div>
          ) : (
            <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
              {items.map((n) => {
                const isUnread = !n.read_at
                const r = renderNotification(n)
                return (
                  <li
                    key={n.id}
                    data-testid={`notification-row-${n.id}`}
                    className={isUnread ? "bg-blue-50/50" : ""}
                  >
                    <Link
                      href={r.href}
                      onClick={() => {
                        if (isUnread) void markOne(n.id)
                        setOpen(false)
                      }}
                      data-testid={`notification-row-${n.id}-link`}
                      className="block px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-gray-900">
                            {r.title}
                          </p>
                          {r.subtitle && (
                            <p className="mt-0.5 truncate text-xs text-gray-600">
                              {r.subtitle}
                            </p>
                          )}
                          <p
                            className="mt-1 text-[11px] text-gray-400"
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
                          <Check
                            size={12}
                            className="mt-1 shrink-0 text-gray-300"
                          />
                        )}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            data-testid="notification-see-all"
            className="block border-t border-gray-100 px-3 py-2 text-center text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900"
          >
            전체 보기
          </Link>
        </div>
      )}
    </div>
  )
}
