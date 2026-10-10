"use client"

import { useMemo, useState } from "react"
import { RotateCcw, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { formatBytes } from "../_mock"
import {
  Avatar,
  Delta,
  DownloadGlyph,
  FILE,
  RETENTION_DAYS,
  dayKey,
  dayLabel,
  deltaOf,
  formatTime,
  memberLabel,
  useVersions,
  type Version,
} from "./shared"

const T = "pg-version-history-b"

/** B: 날짜별로 묶은 세로 타임라인. 저장한 사람 아바타가 줄 위에 놓인다 */
export function VariantB() {
  const { versions, restore, download, downloading, downloaded } = useVersions()
  const [open, setOpen] = useState<string | null>("v5")
  const [confirm, setConfirm] = useState<string | null>(null)

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: Version[] }[] = []
    for (const v of versions) {
      const k = dayKey(v.savedAt)
      const last = out[out.length - 1]
      if (last?.key === k) last.items.push(v)
      else out.push({ key: k, label: dayLabel(v.savedAt), items: [v] })
    }
    return out
  }, [versions])

  const people = useMemo(() => {
    const seen = new Map(versions.map((v) => [v.savedBy.id, v.savedBy]))
    return [...seen.values()]
  }, [versions])

  return (
    <div className="flex h-[620px] w-[520px] max-w-[92vw] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
      <div className="flex items-start gap-3 px-6 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">버전 기록</p>
          <h3 className="mt-0.5 truncate text-lg font-semibold">{FILE.name}</h3>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex -space-x-1.5">
              {people.map((m) => (
                <Avatar key={m.id} m={m} size={20} className="ring-2 ring-background" />
              ))}
            </div>
            <span>
              {versions.length}개 버전, {RETENTION_DAYS}일 보관
            </span>
          </div>
        </div>
        <button
          data-testid={`${T}-close`}
          className="-mr-2 grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t px-6 pb-6">
        {groups.map((g) => (
          <section key={g.key}>
            <h4 className="sticky top-0 z-10 bg-background/95 pt-4 pb-2 text-xs font-semibold text-foreground backdrop-blur">
              {g.label}
            </h4>
            <ol className="relative">
              {g.items.map((v, i) => {
                const isOpen = open === v.id
                const asking = confirm === v.id
                const prog = downloading[v.id]
                const last = i === g.items.length - 1
                return (
                  <li key={v.id} className="relative flex gap-3 pb-1">
                    {/* 세로 줄 */}
                    {!last && <span className="absolute top-8 bottom-0 left-[13px] w-px bg-border" />}
                    <div className="relative z-[1] pt-2">
                      <Avatar
                        m={v.savedBy}
                        size={28}
                        className={cn(
                          "ring-[3px] ring-background",
                          v.current && "outline-2 outline-offset-2 outline-primary",
                        )}
                      />
                    </div>
                    <div
                      className={cn(
                        "mb-1 min-w-0 flex-1 rounded-lg border transition-colors",
                        isOpen ? "border-border bg-card shadow-sm" : "border-transparent hover:bg-muted/50",
                        asking && "border-amber-300 dark:border-amber-800",
                      )}
                    >
                      <button
                        onClick={() => {
                          setOpen(isOpen ? null : v.id)
                          setConfirm(null)
                        }}
                        data-testid={`${T}-item-${v.id}`}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-sm">
                            <span className="truncate font-medium">{memberLabel(v.savedBy)}</span>
                            <span className="shrink-0 text-muted-foreground">{formatTime(v.savedAt)}</span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>v{v.no},</span>
                            <span className="tabular-nums">{formatBytes(v.size)}</span>
                            <Delta n={deltaOf(versions, v)} />
                            {v.restoredFrom && (
                              <span className="-ml-1.5">, v{v.restoredFrom}에서 복원</span>
                            )}
                          </span>
                        </span>
                        {v.current && (
                          <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary dark:bg-primary/20 dark:text-foreground">
                            현재 버전
                          </span>
                        )}
                      </button>

                      {isOpen && !asking && (
                        <div className="flex gap-2 px-3 pb-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => download(v.id)}
                            disabled={prog !== undefined}
                            data-testid={`${T}-download-${v.id}`}
                            className="gap-1.5"
                          >
                            <DownloadGlyph progress={prog} done={downloaded.has(v.id)} size={14} />
                            {prog !== undefined ? `${prog}%` : "다운로드"}
                          </Button>
                          {!v.current && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConfirm(v.id)}
                              data-testid={`${T}-restore-${v.id}`}
                              className="gap-1.5"
                            >
                              <RotateCcw size={14} /> 이 버전으로 복원
                            </Button>
                          )}
                        </div>
                      )}

                      {asking && (
                        <div className="mx-3 mb-3 rounded-md bg-amber-50 px-3 py-2.5 dark:bg-amber-950/40">
                          <p className="text-xs text-amber-900 dark:text-amber-200">
                            v{v.no}으로 복원, 현재 버전은 기록에 남음
                          </p>
                          <div className="mt-2 flex justify-end gap-1.5">
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
                                setOpen(null)
                              }}
                              data-testid={`${T}-restore-confirm-${v.id}`}
                            >
                              복원
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  )
}
