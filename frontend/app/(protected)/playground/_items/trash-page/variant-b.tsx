"use client"

import { useState } from "react"
import { Folder, RotateCcw, Trash2, X } from "lucide-react"

import { cn } from "@/lib/utils"

import { formatBytes } from "../_mock"
import { CheckBox, KindIcon, RETENTION_DAYS, daysLeft, thumbOf, urgency, useTrash, type TrashItem } from "./shared"

function bucket(it: TrashItem): string {
  const passed = RETENTION_DAYS - daysLeft(it.deletedAt)
  if (passed < 7) return "이번 주"
  if (passed < 14) return "지난주"
  return "2주 이상"
}

function Ring({ left }: { left: number }) {
  const r = 9
  const c = 2 * Math.PI * r
  const u = urgency(left)
  return (
    <span
      className="relative inline-flex size-9 items-center justify-center rounded-full bg-background/90 shadow-sm backdrop-blur"
      title={`${left}일 후 자동 삭제`}
    >
      <svg viewBox="0 0 24 24" className="absolute inset-0 size-9 -rotate-90">
        <circle cx="12" cy="12" r={r} fill="none" strokeWidth="2.5" className="stroke-muted" />
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - left / RETENTION_DAYS)}
          className={cn(
            left <= 7 ? "stroke-rose-500" : left <= 14 ? "stroke-amber-500" : "stroke-muted-foreground/60",
          )}
        />
      </svg>
      <span className={cn("relative text-[10px] font-semibold tabular-nums", u.text)}>
        {left}
      </span>
    </span>
  )
}

// 삭제 시기별 카드
export function VariantB() {
  const t = useTrash()
  const [confirm, setConfirm] = useState<null | "empty" | "selected">(null)

  const groups = ["이번 주", "지난주", "2주 이상"]
    .map((g) => ({ label: g, items: t.items.filter((i) => bucket(i) === g) }))
    .filter((g) => g.items.length > 0)
  const sel = t.selected.size
  const selSize = t.items.filter((i) => t.selected.has(i.id)).reduce((s, i) => s + i.size, 0)

  return (
    <div className="mx-auto max-w-5xl">
      <header className="sticky -top-6 z-10 -mx-6 mb-6 bg-background/85 px-6 py-3 backdrop-blur">
        {sel > 0 ? (
          <div className="flex h-10 items-center gap-2 rounded-xl border bg-card px-2 pl-4 shadow-sm">
            <button
              type="button"
              data-testid="pg-trash-page-b-clear"
              onClick={() => {
                t.clear()
                setConfirm(null)
              }}
              className="-ml-2 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
            <span className="text-sm font-medium tabular-nums">{sel}개 선택</span>
            <span className="text-sm text-muted-foreground tabular-nums">{formatBytes(selSize)}</span>
            <div className="flex-1" />
            {confirm === "selected" ? (
              <>
                <button
                  type="button"
                  data-testid="pg-trash-page-b-delete-cancel"
                  onClick={() => setConfirm(null)}
                  className="h-7 rounded-md px-2.5 text-sm hover:bg-muted"
                >
                  취소
                </button>
                <button
                  type="button"
                  data-testid="pg-trash-page-b-delete-confirm"
                  onClick={() => {
                    t.purge([...t.selected])
                    setConfirm(null)
                  }}
                  className="h-7 rounded-md bg-rose-600 px-2.5 text-sm font-medium text-white hover:bg-rose-700"
                >
                  {sel}개 영구 삭제
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  data-testid="pg-trash-page-b-delete"
                  onClick={() => setConfirm("selected")}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="size-3.5" />
                  영구 삭제
                </button>
                <button
                  type="button"
                  data-testid="pg-trash-page-b-restore"
                  onClick={() => t.restore([...t.selected])}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <RotateCcw className="size-3.5" />
                  복원
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex h-10 items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">휴지통</h1>
            <div className="flex-1" />
            {t.items.length > 0 &&
              (confirm === "empty" ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {t.items.length}개, {formatBytes(t.totalSize)}
                  </span>
                  <button
                    type="button"
                    data-testid="pg-trash-page-b-empty-cancel"
                    onClick={() => setConfirm(null)}
                    className="h-8 rounded-md px-3 text-sm hover:bg-muted"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    data-testid="pg-trash-page-b-empty-confirm"
                    onClick={() => {
                      t.emptyAll()
                      setConfirm(null)
                    }}
                    className="h-8 rounded-md bg-rose-600 px-3 text-sm font-medium text-white hover:bg-rose-700"
                  >
                    모두 영구 삭제
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="pg-trash-page-b-empty"
                  onClick={() => setConfirm("empty")}
                  className="h-8 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  휴지통 비우기
                </button>
              ))}
          </div>
        )}
      </header>

      {t.items.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-28 text-muted-foreground">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-muted">
            <Trash2 className="size-7" />
          </span>
          <p className="text-sm">휴지통이 비어 있음</p>
          <button
            type="button"
            data-testid="pg-trash-page-b-refill"
            onClick={t.refill}
            className="text-xs underline-offset-4 hover:underline"
          >
            다시 채우기
          </button>
        </div>
      )}

      <div className="space-y-8">
        {groups.map((g) => {
          const ids = g.items.map((i) => i.id)
          const n = ids.filter((id) => t.selected.has(id)).length
          return (
            <section key={g.label}>
              <div className="mb-3 flex items-center gap-2">
                <button
                  type="button"
                  data-testid={`pg-trash-page-b-group-${g.label}`}
                  onClick={() => ids.forEach((id) => (n === ids.length || !t.selected.has(id)) && t.toggle(id))}
                  className="flex items-center gap-2"
                >
                  <CheckBox state={n === 0 ? "off" : n === ids.length ? "on" : "some"} />
                  <h2 className="text-sm font-semibold">{g.label}</h2>
                </button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {g.items.length}, {formatBytes(g.items.reduce((s, i) => s + i.size, 0))}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-4">
                {g.items.map((it) => {
                  const on = t.selected.has(it.id)
                  const left = daysLeft(it.deletedAt)
                  const thumb = thumbOf(it)
                  return (
                    <div
                      key={it.id}
                      className={cn(
                        "group relative overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md",
                        on && "border-primary ring-2 ring-primary/30",
                      )}
                    >
                      <button
                        type="button"
                        data-testid={`pg-trash-page-b-card-${it.id}`}
                        onClick={() => t.toggle(it.id)}
                        className="block w-full text-left"
                      >
                        <span
                          className="flex h-32 items-center justify-center bg-muted/60 grayscale-[35%]"
                          style={thumb ? { background: thumb } : undefined}
                        >
                          {!thumb && (
                            <span className="scale-150">
                              <KindIcon kind={it.kind} size="lg" />
                            </span>
                          )}
                        </span>
                        <span className="block border-t px-3 py-2.5">
                          <span className="block truncate text-sm font-medium">{it.name}</span>
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Folder className="size-3 shrink-0" />
                            <span className="truncate">{it.originalPath}</span>
                            <span className="ml-auto shrink-0 tabular-nums">{formatBytes(it.size)}</span>
                          </span>
                        </span>
                      </button>
                      <CheckBox
                        state={on ? "on" : "off"}
                        className={cn(
                          "pointer-events-none absolute top-2.5 left-2.5 shadow-sm transition-opacity",
                          !on && sel === 0 && "opacity-0 group-hover:opacity-100",
                        )}
                      />
                      <span className="pointer-events-none absolute top-2 right-2">
                        <Ring left={left} />
                      </span>
                      <button
                        type="button"
                        data-testid={`pg-trash-page-b-card-${it.id}-restore`}
                        onClick={() => t.restore([it.id])}
                        className="absolute bottom-[60px] left-1/2 inline-flex -translate-x-1/2 translate-y-2 items-center gap-1 rounded-full bg-background/95 px-3 py-1 text-xs font-medium opacity-0 shadow-md transition-all group-hover:translate-y-0 group-hover:opacity-100 hover:bg-background"
                      >
                        <RotateCcw className="size-3" />
                        복원
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
