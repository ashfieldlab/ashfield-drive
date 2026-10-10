"use client"

import { useState } from "react"
import { CornerUpLeft, Folder, RotateCcw, Trash2, X } from "lucide-react"

import { cn } from "@/lib/utils"

import { formatBytes, relativeTime } from "../_mock"
import { CheckBox, KindIcon, RETENTION_DAYS, daysLeft, urgency, useTrash } from "./shared"

// 표 + 남은 기간
export function VariantA() {
  const t = useTrash()
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [confirmRow, setConfirmRow] = useState<string | null>(null)
  const [confirmBulk, setConfirmBulk] = useState(false)

  const sel = t.selected.size
  const allState = sel === 0 ? "off" : sel === t.items.length ? "on" : "some"

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex h-9 items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">휴지통</h1>
        <span className="text-sm text-muted-foreground tabular-nums">
          {t.items.length}개 · {formatBytes(t.totalSize)}
        </span>
        <div className="flex-1" />
        {t.items.length > 0 && !confirmEmpty && (
          <button
            type="button"
            data-testid="pg-trash-page-a-empty"
            onClick={() => setConfirmEmpty(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="size-4" />
            휴지통 비우기
          </button>
        )}
      </header>

      {confirmEmpty && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900/60 dark:bg-rose-950/40">
          <Trash2 className="size-4 text-rose-600 dark:text-rose-400" />
          <p className="flex-1 text-sm text-rose-900 dark:text-rose-200">
            {t.items.length}개 항목, {formatBytes(t.totalSize)} 영구 삭제
          </p>
          <button
            type="button"
            data-testid="pg-trash-page-a-empty-cancel"
            onClick={() => setConfirmEmpty(false)}
            className="h-8 rounded-md px-3 text-sm text-rose-900 hover:bg-rose-100 dark:text-rose-200 dark:hover:bg-rose-900/40"
          >
            취소
          </button>
          <button
            type="button"
            data-testid="pg-trash-page-a-empty-confirm"
            onClick={() => {
              t.emptyAll()
              setConfirmEmpty(false)
            }}
            className="h-8 rounded-md bg-rose-600 px-3 text-sm font-medium text-white hover:bg-rose-700"
          >
            영구 삭제
          </button>
        </div>
      )}

      {t.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-24 text-muted-foreground">
          <Trash2 className="size-8 opacity-50" />
          <p className="text-sm">휴지통이 비어 있음</p>
          <button
            type="button"
            data-testid="pg-trash-page-a-refill"
            onClick={t.refill}
            className="text-xs underline-offset-4 hover:underline"
          >
            다시 채우기
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          {sel > 0 && (
            <div className="flex h-11 items-center gap-2 border-b bg-primary/5 px-3 text-sm">
              <span className="font-medium tabular-nums">{sel}개 선택</span>
              <div className="flex-1" />
              {confirmBulk ? (
                <>
                  <span className="mr-1 text-rose-700 dark:text-rose-300">{sel}개 항목 영구 삭제</span>
                  <button
                    type="button"
                    data-testid="pg-trash-page-a-bulk-delete-cancel"
                    onClick={() => setConfirmBulk(false)}
                    className="h-7 rounded-md px-2.5 hover:bg-muted"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    data-testid="pg-trash-page-a-bulk-delete-confirm"
                    onClick={() => {
                      t.purge([...t.selected])
                      setConfirmBulk(false)
                    }}
                    className="h-7 rounded-md bg-rose-600 px-2.5 font-medium text-white hover:bg-rose-700"
                  >
                    영구 삭제
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    data-testid="pg-trash-page-a-bulk-restore"
                    onClick={() => t.restore([...t.selected])}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <RotateCcw className="size-3.5" />
                    복원
                  </button>
                  <button
                    type="button"
                    data-testid="pg-trash-page-a-bulk-delete"
                    onClick={() => setConfirmBulk(true)}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                  >
                    <Trash2 className="size-3.5" />
                    영구 삭제
                  </button>
                  <button
                    type="button"
                    data-testid="pg-trash-page-a-bulk-clear"
                    onClick={t.clear}
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                  >
                    <X className="size-4" />
                  </button>
                </>
              )}
            </div>
          )}
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="w-11 py-2.5 pl-4">
                  <button
                    type="button"
                    data-testid="pg-trash-page-a-select-all"
                    onClick={t.toggleAll}
                    className="flex"
                  >
                    <CheckBox state={allState} />
                  </button>
                </th>
                <th className="py-2.5 pr-4 font-medium">이름</th>
                <th className="w-48 py-2.5 pr-4 font-medium">원래 위치</th>
                <th className="w-24 py-2.5 pr-4 font-medium">삭제</th>
                <th className="w-24 py-2.5 pr-4 text-right font-medium">크기</th>
                <th className="w-36 py-2.5 pr-4 font-medium">자동 삭제까지</th>
                <th className="w-40 py-2.5 pr-4" />
              </tr>
            </thead>
            <tbody>
              {t.items.map((it) => {
                const left = daysLeft(it.deletedAt)
                const u = urgency(left)
                const on = t.selected.has(it.id)
                const confirming = confirmRow === it.id
                return (
                  <tr
                    key={it.id}
                    data-testid={`pg-trash-page-a-row-${it.id}`}
                    onClick={() => t.toggle(it.id)}
                    className={cn(
                      "group h-14 cursor-pointer border-b last:border-b-0 hover:bg-muted/40",
                      on && "bg-primary/5 hover:bg-primary/10",
                    )}
                  >
                    <td className="pl-4">
                      <CheckBox state={on ? "on" : "off"} />
                    </td>
                    <td className="pr-4">
                      <span className="flex min-w-0 items-center gap-3">
                        <KindIcon kind={it.kind} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{it.name}</span>
                          {it.count !== undefined && (
                            <span className="block text-xs text-muted-foreground">항목 {it.count}개</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="pr-4">
                      <button
                        type="button"
                        data-testid={`pg-trash-page-a-row-${it.id}-origin`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex max-w-full items-center gap-1.5 rounded px-1 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Folder className="size-3.5 shrink-0" />
                        <span className="truncate">{it.originalPath}</span>
                      </button>
                    </td>
                    <td className="pr-4 text-muted-foreground">{relativeTime(it.deletedAt)}</td>
                    <td className="pr-4 text-right text-muted-foreground tabular-nums">{formatBytes(it.size)}</td>
                    <td className="pr-4">
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex w-12 justify-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
                            u.pill,
                          )}
                        >
                          {left}일
                        </span>
                        <span className="h-1 w-14 overflow-hidden rounded-full bg-muted">
                          <span
                            className={cn("block h-full rounded-full", u.bar)}
                            style={{ width: `${(left / RETENTION_DAYS) * 100}%` }}
                          />
                        </span>
                      </span>
                    </td>
                    <td className="pr-3" onClick={(e) => e.stopPropagation()}>
                      <span
                        className={cn(
                          "flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100",
                          confirming && "opacity-100",
                        )}
                      >
                        {confirming ? (
                          <>
                            <button
                              type="button"
                              data-testid={`pg-trash-page-a-row-${it.id}-delete-cancel`}
                              onClick={() => setConfirmRow(null)}
                              className="h-7 rounded-md px-2 text-xs hover:bg-muted"
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              data-testid={`pg-trash-page-a-row-${it.id}-delete-confirm`}
                              onClick={() => {
                                t.purge([it.id])
                                setConfirmRow(null)
                              }}
                              className="h-7 rounded-md bg-rose-600 px-2 text-xs font-medium text-white hover:bg-rose-700"
                            >
                              영구 삭제
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              data-testid={`pg-trash-page-a-row-${it.id}-restore`}
                              onClick={() => t.restore([it.id])}
                              className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2 text-xs hover:bg-muted"
                            >
                              <CornerUpLeft className="size-3.5" />
                              복원
                            </button>
                            <button
                              type="button"
                              data-testid={`pg-trash-page-a-row-${it.id}-delete`}
                              onClick={() => setConfirmRow(it.id)}
                              title="영구 삭제"
                              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
