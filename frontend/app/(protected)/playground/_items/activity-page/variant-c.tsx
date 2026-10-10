"use client"

import { useMemo, useState } from "react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

import { MEMBERS, relativeTime, type ActivityAction } from "../_mock"
import { ACTION_META, Avatar, KindIcon, NOW, SORTED, shortLine } from "./shared"

const WEEK = SORTED.filter((a) => NOW.getTime() - new Date(a.at).getTime() < 7 * 86400_000)

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

const DAYS = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() - (6 - i))
  const items = WEEK.filter((a) => dayKey(new Date(a.at)) === dayKey(d))
  return {
    key: dayKey(d),
    label: i === 6 ? "오늘" : d.toLocaleDateString("ko-KR", { weekday: "short" }),
    full: d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" }),
    count: items.length,
  }
})

const TILES: { key: string; label: string; actions: ActivityAction[] | null }[] = [
  { key: "all", label: "전체 활동", actions: null },
  { key: "upload", label: "업로드", actions: ["upload", "create", "version"] },
  { key: "share", label: "공유", actions: ["share", "link", "unshare"] },
  { key: "delete", label: "삭제", actions: ["delete"] },
]

// 이번 주 요약 + 피드
export function VariantC() {
  const [tile, setTile] = useState("all")
  const [day, setDay] = useState<string | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  const max = Math.max(...DAYS.map((d) => d.count), 1)
  const people = MEMBERS.map((m) => ({ m, n: WEEK.filter((a) => a.actor.id === m.id).length }))
    .filter((p) => p.n > 0)
    .sort((a, b) => b.n - a.n)
  const topN = Math.max(...people.map((p) => p.n), 1)

  const feed = useMemo(() => {
    const acts = TILES.find((t) => t.key === tile)!.actions
    return SORTED.filter(
      (a) => (!acts || acts.includes(a.action)) && (!day || dayKey(new Date(a.at)) === day),
    )
  }, [tile, day])

  const dayLabel = DAYS.find((d) => d.key === day)?.full

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">활동</h1>
        <span className="text-sm text-muted-foreground">최근 7일</span>
      </header>

      <div className="grid grid-cols-4 gap-3">
        {TILES.map((t) => {
          const n = t.actions ? WEEK.filter((a) => t.actions!.includes(a.action)).length : WEEK.length
          return (
            <button
              key={t.key}
              type="button"
              data-testid={`pg-activity-page-c-tile-${t.key}`}
              onClick={() => setTile(t.key)}
              className={cn(
                "rounded-xl border bg-card p-4 text-left transition-colors hover:border-foreground/20",
                tile === t.key && "border-foreground/40 ring-1 ring-foreground/10",
              )}
            >
              <div className="text-xs text-muted-foreground">{t.label}</div>
              <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{n}</div>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <section className="col-span-2 rounded-xl border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium">일별 활동</h2>
            {day && (
              <button
                type="button"
                data-testid="pg-activity-page-c-day-clear"
                onClick={() => setDay(null)}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs hover:bg-muted/70"
              >
                {dayLabel}
                <X className="size-3" />
              </button>
            )}
          </div>
          <div className="flex h-36 items-end gap-3">
            {DAYS.map((d, i) => {
              const h = d.count === 0 ? 0 : Math.max(8, (d.count / max) * 100)
              const dim = day !== null && day !== d.key
              return (
                <button
                  key={d.key}
                  type="button"
                  data-testid={`pg-activity-page-c-day-${i}`}
                  onClick={() => setDay(day === d.key ? null : d.key)}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  className="group relative flex h-full flex-1 flex-col items-center justify-end gap-2"
                >
                  {hover === i && (
                    <span className="absolute -top-1 z-10 -translate-y-full rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md">
                      {d.full} · <span className="font-medium tabular-nums">{d.count}</span>건
                    </span>
                  )}
                  <span className="relative flex w-full flex-1 items-end justify-center">
                    <span className="absolute inset-x-0 bottom-0 h-px bg-border" />
                    <span
                      className={cn(
                        "w-full max-w-10 rounded-t-[4px] bg-primary transition-opacity",
                        dim && "opacity-25",
                        hover === i && "opacity-80",
                      )}
                      style={{ height: `${h}%` }}
                    />
                  </span>
                  <span
                    className={cn(
                      "text-xs text-muted-foreground",
                      day === d.key && "font-medium text-foreground",
                    )}
                  >
                    {d.label}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-4 text-sm font-medium">참여한 사람</h2>
          <ul className="space-y-3">
            {people.map(({ m, n }) => (
              <li key={m.id} className="flex items-center gap-2.5 text-sm">
                <Avatar m={m} size={22} />
                <span className="w-14 truncate">{m.name}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-foreground/60"
                    style={{ width: `${(n / topN) * 100}%` }}
                  />
                </span>
                <span className="w-4 text-right text-xs text-muted-foreground tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section>
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="text-sm font-medium">{TILES.find((t) => t.key === tile)!.label}</h2>
          <span className="text-xs text-muted-foreground tabular-nums">{feed.length}</span>
        </div>
        <ul className="divide-y rounded-xl border bg-card">
          {feed.map((a) => {
            const meta = ACTION_META[a.action]
            return (
              <li key={a.id}>
                <button
                  type="button"
                  data-testid={`pg-activity-page-c-row-${a.id}`}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <span className="relative">
                    <KindIcon kind={a.targetKind} size="lg" />
                    <span
                      className={cn("absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-card", meta.dot)}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{a.target}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {a.actor.name} · {shortLine(a)}
                    </span>
                  </span>
                  <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", meta.tone)}>{meta.label}</span>
                  <span className="w-14 text-right text-xs text-muted-foreground">{relativeTime(a.at)}</span>
                </button>
              </li>
            )
          })}
          {feed.length === 0 && <li className="py-12 text-center text-sm text-muted-foreground">활동 없음</li>}
        </ul>
      </section>
    </div>
  )
}
