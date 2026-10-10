"use client"

import { useMemo, useState } from "react"
import { RotateCcw, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { formatBytes } from "../_mock"
import { PreviewBody } from "../file-preview/shared"
import {
  Avatar,
  Delta,
  DownloadGlyph,
  FILE,
  RETENTION_DAYS,
  dayKey,
  dayLabel,
  deltaOf,
  formatDateTime,
  formatTime,
  memberLabel,
  useVersions,
  type Version,
} from "./shared"

const T = "pg-version-history-d"

/** D: B 의 날짜별 타임라인 + C 의 버전 미리보기 */
export function VariantD() {
  const { versions, restore, download, downloading, downloaded } = useVersions()
  const [sel, setSel] = useState("v3")
  const [asking, setAsking] = useState(false)

  const current = versions.find((v) => v.current)!
  const v = versions.find((x) => x.id === sel) ?? current
  const prog = downloading[v.id]

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: Version[] }[] = []
    for (const x of versions) {
      const k = dayKey(x.savedAt)
      const last = out[out.length - 1]
      if (last?.key === k) last.items.push(x)
      else out.push({ key: k, label: dayLabel(x.savedAt), items: [x] })
    }
    return out
  }, [versions])

  const people = useMemo(() => [...new Map(versions.map((x) => [x.savedBy.id, x.savedBy])).values()], [versions])

  return (
    <div className="flex h-[620px] w-[900px] max-w-full overflow-hidden rounded-xl border bg-background shadow-2xl">
      {/* 타임라인 */}
      <div className="flex w-[320px] shrink-0 flex-col border-r">
        <div className="px-5 pt-5 pb-4">
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

        <div className="min-h-0 flex-1 overflow-y-auto border-t px-4 pb-5" data-testid={`${T}-list`}>
          {groups.map((g) => (
            <section key={g.key}>
              <h4 className="sticky top-0 z-10 bg-background/95 px-1 pt-4 pb-2 text-xs font-semibold backdrop-blur">{g.label}</h4>
              <ol>
                {g.items.map((x, i) => {
                  const on = x.id === v.id
                  const last = i === g.items.length - 1
                  return (
                    <li key={x.id} className="relative flex gap-3 pb-1">
                      {!last && <span className="absolute top-9 bottom-0 left-[17px] w-px bg-border" />}
                      <div className="relative z-[1] pt-2 pl-1">
                        <Avatar
                          m={x.savedBy}
                          size={26}
                          className={cn("ring-[3px] ring-background", x.current && "outline-2 outline-offset-2 outline-primary")}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSel(x.id)
                          setAsking(false)
                        }}
                        data-testid={`${T}-item-${x.id}`}
                        className={cn(
                          "mb-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                          on ? "border-border bg-card shadow-sm" : "border-transparent hover:bg-muted/50",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-sm">
                            <span className="truncate font-medium">{memberLabel(x.savedBy)}</span>
                            <span className="shrink-0 text-muted-foreground">{formatTime(x.savedAt)}</span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>v{x.no},</span>
                            <span className="tabular-nums">{formatBytes(x.size)}</span>
                            <Delta n={deltaOf(versions, x)} />
                          </span>
                        </span>
                        {x.current && (
                          <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary dark:bg-primary/20 dark:text-foreground">
                            현재
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
      </div>

      {/* 미리보기 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[72px] shrink-0 items-center gap-3 px-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold">버전 {v.no}</span>
              {v.current && (
                <span className="rounded-full bg-emerald-50 px-2 py-px text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  현재
                </span>
              )}
              {v.restoredFrom && (
                <span className="rounded-full border px-2 py-px text-[11px] text-muted-foreground">v{v.restoredFrom}에서 복원</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {memberLabel(v.savedBy)}, {formatDateTime(v.savedAt)}
            </p>
          </div>
          <button
            type="button"
            data-testid={`${T}-close`}
            className="-mr-2 grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <div className="relative mx-6 min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/40">
          <div key={v.id} className="flex min-h-full items-start justify-center p-6 duration-200 animate-in fade-in">
            <PreviewBody node={FILE} compact />
          </div>
        </div>

        <div className="mt-4 flex h-14 shrink-0 items-center gap-2 border-t px-6">
          {asking ? (
            <>
              <RotateCcw size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">v{v.no}</span>으로 복원
                <span className="text-muted-foreground">, 현재 버전은 기록에 남음</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setAsking(false)} data-testid={`${T}-restore-cancel`}>
                취소
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  restore(v.id)
                  setAsking(false)
                  setSel(`v${Math.max(...versions.map((x) => x.no)) + 1}`)
                }}
                data-testid={`${T}-restore-confirm`}
              >
                복원
              </Button>
            </>
          ) : (
            <>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => download(v.id)}
                disabled={prog !== undefined}
                data-testid={`${T}-download`}
                className="min-w-24 gap-1.5"
              >
                <DownloadGlyph progress={prog} done={downloaded.has(v.id)} size={14} />
                {prog !== undefined ? `${prog}%` : "다운로드"}
              </Button>
              <Button size="sm" onClick={() => setAsking(true)} disabled={v.current} data-testid={`${T}-restore`} className="gap-1.5">
                <RotateCcw size={14} /> 이 버전으로 복원
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
