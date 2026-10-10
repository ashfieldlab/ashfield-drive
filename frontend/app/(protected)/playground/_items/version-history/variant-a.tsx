"use client"

import { useState } from "react"
import { FileText, RotateCcw, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { formatBytes } from "../_mock"
import {
  Avatar,
  Delta,
  DownloadGlyph,
  FILE,
  RETENTION_DAYS,
  deltaOf,
  formatDateTime,
  useVersions,
} from "./shared"

const T = "pg-version-history-a"

/** A: 깔끔한 목록. 행에 올리면 동작 버튼, 복원은 행 안에서 확인 */
export function VariantA() {
  const { versions, restore, download, downloading, downloaded } = useVersions()
  const [confirm, setConfirm] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)

  return (
    <div className="flex max-h-[640px] w-[540px] max-w-[92vw] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
      <div className="flex items-center gap-3 border-b px-5 py-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
          <FileText size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold">{FILE.name}</h3>
          <p className="text-xs text-muted-foreground">
            버전 {versions.length}개 · {RETENTION_DAYS}일 보관
          </p>
        </div>
        <button
          data-testid={`${T}-close`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto py-1.5" data-testid={`${T}-list`}>
        {versions.map((v) => {
          const asking = confirm === v.id
          const prog = downloading[v.id]
          const busy = prog !== undefined || downloaded.has(v.id)
          return (
            <li
              key={v.id}
              className={cn(
                "group relative mx-1.5 rounded-lg transition-colors",
                asking ? "bg-muted" : "hover:bg-muted/60",
                fresh === v.id && "animate-in fade-in slide-in-from-top-2 duration-300",
              )}
            >
              <div className="flex items-center gap-3 px-3.5 py-2.5">
                <span
                  className={cn(
                    "w-7 shrink-0 text-xs font-medium tabular-nums",
                    v.current ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  v{v.no}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm">{formatDateTime(v.savedAt)}</span>
                    {v.current && (
                      <span className="shrink-0 rounded-full bg-primary px-2 py-px text-[10px] font-medium text-primary-foreground">
                        현재
                      </span>
                    )}
                    {v.restoredFrom && (
                      <span className="shrink-0 rounded-full border px-2 py-px text-[10px] text-muted-foreground">
                        v{v.restoredFrom}에서 복원
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Avatar m={v.savedBy} size={16} />
                    <span>{v.savedBy.name}</span>
                    <span className="opacity-50">·</span>
                    <span className="tabular-nums">{formatBytes(v.size)}</span>
                    <Delta n={deltaOf(versions, v)} />
                  </div>
                </div>
                <div
                  className={cn(
                    "flex shrink-0 items-center gap-0.5 transition-opacity",
                    asking || busy ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
                  )}
                >
                  <button
                    onClick={() => download(v.id)}
                    disabled={prog !== undefined}
                    title="다운로드"
                    data-testid={`${T}-download-${v.id}`}
                    className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <DownloadGlyph progress={prog} done={downloaded.has(v.id)} />
                  </button>
                  {!v.current && (
                    <button
                      onClick={() => setConfirm(asking ? null : v.id)}
                      title="이 버전으로 복원"
                      data-testid={`${T}-restore-${v.id}`}
                      className={cn(
                        "grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground",
                        asking && "bg-background text-foreground",
                      )}
                    >
                      <RotateCcw size={15} />
                    </button>
                  )}
                </div>
              </div>
              {asking && (
                <div className="flex items-center gap-2 border-t border-border/70 px-3.5 py-2.5 pl-[3.25rem]">
                  <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">v{v.no}</span>으로 복원 · 현재 버전은 기록에 남음
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirm(null)}
                    data-testid={`${T}-restore-cancel-${v.id}`}
                  >
                    취소
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      restore(v.id)
                      setConfirm(null)
                      setFresh(`v${Math.max(...versions.map((x) => x.no)) + 1}`)
                    }}
                    data-testid={`${T}-restore-confirm-${v.id}`}
                  >
                    복원
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
