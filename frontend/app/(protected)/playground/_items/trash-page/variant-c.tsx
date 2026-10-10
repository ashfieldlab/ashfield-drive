"use client"

import { useState } from "react"
import { Check, RotateCcw, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"

import { QUOTA, formatBytes, relativeTime } from "../_mock"
import { KindIcon, RETENTION_DAYS, daysLeft, urgency, useTrash } from "./shared"

// 요약 바 + 밀어내는 행 동작
export function VariantC() {
  const t = useTrash()
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [confirmRow, setConfirmRow] = useState<string | null>(null)

  const sel = t.selected.size
  const selSize = t.items.filter((i) => t.selected.has(i.id)).reduce((s, i) => s + i.size, 0)
  const usedPct = (QUOTA.used / QUOTA.total) * 100
  const trashPct = (t.totalSize / QUOTA.total) * 100

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">휴지통</h1>

      <div
        className={cn(
          "mb-6 rounded-2xl border p-5 transition-colors",
          confirmEmpty
            ? "border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/40"
            : "bg-card",
        )}
      >
        <div className="flex items-center gap-6">
          <div className="flex items-baseline gap-4">
            <div>
              <div className="text-3xl font-semibold tracking-tight tabular-nums">
                {sel > 0 ? sel : t.items.length}
              </div>
              <div className="text-xs text-muted-foreground">{sel > 0 ? "선택" : "항목"}</div>
            </div>
            <div>
              <div className="text-3xl font-semibold tracking-tight tabular-nums">
                {formatBytes(sel > 0 ? selSize : t.totalSize)}
              </div>
              <div className="text-xs text-muted-foreground">크기</div>
            </div>
          </div>
          <div className="flex-1" />
          {confirmEmpty ? (
            <div className="flex items-center gap-2">
              <span className="mr-1 text-sm font-medium text-rose-800 dark:text-rose-200">모두 영구 삭제</span>
              <button
                type="button"
                data-testid="pg-trash-page-c-empty-cancel"
                onClick={() => setConfirmEmpty(false)}
                className="h-9 rounded-lg border border-rose-200 bg-background px-4 text-sm hover:bg-muted dark:border-rose-900/60"
              >
                취소
              </button>
              <button
                type="button"
                data-testid="pg-trash-page-c-empty-confirm"
                onClick={() => {
                  t.emptyAll()
                  setConfirmEmpty(false)
                }}
                className="h-9 rounded-lg bg-rose-600 px-4 text-sm font-medium text-white hover:bg-rose-700"
              >
                삭제
              </button>
            </div>
          ) : sel > 0 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="pg-trash-page-c-clear"
                onClick={t.clear}
                className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted"
              >
                선택 해제
              </button>
              <button
                type="button"
                data-testid="pg-trash-page-c-bulk-delete"
                onClick={() => t.purge([...t.selected])}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
              >
                <Trash2 className="size-4" />
                영구 삭제
              </button>
              <button
                type="button"
                data-testid="pg-trash-page-c-bulk-restore"
                onClick={() => t.restore([...t.selected])}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <RotateCcw className="size-4" />
                복원
              </button>
            </div>
          ) : (
            t.items.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="pg-trash-page-c-restore-all"
                  onClick={() => t.restore(t.items.map((i) => i.id))}
                  className="h-9 rounded-lg border px-4 text-sm hover:bg-muted"
                >
                  모두 복원
                </button>
                <button
                  type="button"
                  data-testid="pg-trash-page-c-empty"
                  onClick={() => setConfirmEmpty(true)}
                  className="h-9 rounded-lg bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/90"
                >
                  비우기
                </button>
              </div>
            )
          )}
        </div>
        <div className="mt-5">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
            <span className="h-full bg-foreground/25" style={{ width: `${usedPct - trashPct}%` }} />
            <span className="ml-0.5 h-full bg-rose-500" style={{ width: `${Math.max(trashPct, 0.6)}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>
              {formatBytes(QUOTA.used)} / {formatBytes(QUOTA.total)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-rose-500" />
              휴지통 {formatBytes(t.totalSize)}
            </span>
          </div>
        </div>
      </div>

      {t.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <Check className="size-8 opacity-50" />
          <p className="text-sm">휴지통이 비어 있음</p>
          <button
            type="button"
            data-testid="pg-trash-page-c-refill"
            onClick={t.refill}
            className="text-xs underline-offset-4 hover:underline"
          >
            다시 채우기
          </button>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border bg-card">
          {t.items.map((it) => {
            const on = t.selected.has(it.id)
            const left = daysLeft(it.deletedAt)
            const u = urgency(left)
            const confirming = confirmRow === it.id
            return (
              <li
                key={it.id}
                className={cn(
                  "group relative overflow-hidden border-b last:border-b-0",
                  on && "bg-primary/5",
                )}
                onMouseLeave={() => confirming && setConfirmRow(null)}
              >
                <button
                  type="button"
                  data-testid={`pg-trash-page-c-row-${it.id}`}
                  onClick={() => t.toggle(it.id)}
                  className="flex h-16 w-full items-center gap-3 px-4 text-left"
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border border-input transition-all",
                      on ? "border-primary bg-primary text-primary-foreground" : "opacity-40 group-hover:opacity-100",
                    )}
                  >
                    {on && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <KindIcon kind={it.kind} size="lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{it.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {it.originalPath}, {relativeTime(it.deletedAt)} 삭제
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5 transition-all duration-200 group-hover:-translate-x-6 group-hover:opacity-0">
                    <span className={cn("text-xs font-medium tabular-nums", u.text)}>{left}일 남음</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatBytes(it.size)}</span>
                  </span>
                </button>
                <span
                  className="pointer-events-none absolute bottom-0 left-0 h-0.5 opacity-60"
                  style={{ width: `${(left / RETENTION_DAYS) * 100}%` }}
                >
                  <span className={cn("block h-full", u.bar)} />
                </span>
                <span
                  className={cn(
                    "absolute inset-y-0 right-0 flex translate-x-full transition-transform duration-200 group-hover:translate-x-0",
                    confirming && "translate-x-0",
                  )}
                >
                  {confirming ? (
                    <button
                      type="button"
                      data-testid={`pg-trash-page-c-row-${it.id}-delete-confirm`}
                      onClick={() => {
                        t.purge([it.id])
                        setConfirmRow(null)
                      }}
                      className="flex w-40 items-center justify-center gap-1.5 bg-rose-600 text-sm font-medium text-white hover:bg-rose-700"
                    >
                      <Trash2 className="size-4" />
                      영구 삭제
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        data-testid={`pg-trash-page-c-row-${it.id}-restore`}
                        onClick={() => t.restore([it.id])}
                        className="flex w-20 flex-col items-center justify-center gap-0.5 bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        <RotateCcw className="size-4" />
                        복원
                      </button>
                      <button
                        type="button"
                        data-testid={`pg-trash-page-c-row-${it.id}-delete`}
                        onClick={() => setConfirmRow(it.id)}
                        className="flex w-20 flex-col items-center justify-center gap-0.5 bg-rose-600 text-xs font-medium text-white hover:bg-rose-700"
                      >
                        <Trash2 className="size-4" />
                        삭제
                      </button>
                    </>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
