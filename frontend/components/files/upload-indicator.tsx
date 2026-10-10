"use client"

/**
 * 사이드바 업로드 표시 (playground upload D): 링 + "업로드 N개" + "%, 남은 시간, 실패 N".
 * 누르면 목적지 폴더별 목록 (누르면 그 폴더로), 모두 재시도, 끝나면 지우기.
 * AppShell 이 업로드가 있을 때만 sidebarExtra 로 붙인다.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, CircleAlert, CircleCheck, Folder, X } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { clearFinished, retryAll, useUploads } from "@/lib/uploads/store"
import { formatEta, summarize } from "@/lib/uploads/view"
import { Ring } from "@/components/files/upload-rows"

export function UploadIndicator() {
  const items = useUploads()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const live = items.filter((u) => u.state !== "canceled")
  if (live.length === 0) return null
  const s = summarize(live)
  const busy = s.active > 0

  const groups = [...new Set(live.map((u) => u.destKey))].map((key) => {
    const g = live.filter((u) => u.destKey === key)
    return { key, dest: g[0].dest, items: g, s: summarize(g) }
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="upload-indicator-button"
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg border bg-background px-2.5 py-2 text-left shadow-xs transition-colors hover:bg-muted/60",
            s.failed > 0 && "border-rose-200 dark:border-rose-900",
          )}
        >
          {busy ? (
            <Ring pct={s.pct} size={22} stroke={2.5} />
          ) : s.failed > 0 ? (
            <CircleAlert className="size-5 shrink-0 text-rose-600 dark:text-rose-400" />
          ) : (
            <CircleCheck className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground" data-testid="upload-indicator-title">
              {busy ? `업로드 ${s.active}개` : s.failed > 0 ? "업로드 실패" : "업로드 완료"}
            </span>
            <span
              className={cn(
                "block truncate text-xs tabular-nums",
                s.failed > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
              )}
            >
              {busy
                ? [`${s.pct}%`, formatEta(s.eta), s.failed > 0 && `실패 ${s.failed}`].filter(Boolean).join(", ")
                : s.failed > 0
                  ? `${s.failed}개`
                  : `${s.done}개`}
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-72 p-0" data-testid="upload-indicator-popover">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="text-sm font-medium">업로드</span>
          <span className="flex items-center gap-1">
            {s.failed > 0 && (
              <button
                type="button"
                data-testid="upload-indicator-retry-all"
                onClick={retryAll}
                className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50"
              >
                모두 재시도
              </button>
            )}
            {!busy && (
              <button
                type="button"
                data-testid="upload-indicator-clear"
                onClick={() => {
                  clearFinished()
                  setOpen(false)
                }}
                title="지우기"
                aria-label="지우기"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </span>
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {groups.map((g) => (
            <li key={g.key}>
              <button
                type="button"
                data-testid={`upload-indicator-go-${g.dest.parentId ?? g.dest.scope}`}
                onClick={() => {
                  router.push(g.dest.href)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-muted"
              >
                <Folder className="size-4 shrink-0 text-sky-600 dark:text-sky-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{g.dest.label}</span>
                  <span
                    className={cn(
                      "block text-xs tabular-nums",
                      g.s.failed ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
                    )}
                  >
                    {g.items.length}개
                    {g.s.active > 0 ? `, ${g.s.pct}%` : g.s.failed > 0 ? `, 실패 ${g.s.failed}` : ", 완료"}
                  </span>
                </span>
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
