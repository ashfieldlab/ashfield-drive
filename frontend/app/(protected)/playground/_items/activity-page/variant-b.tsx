"use client"

import { Fragment, useMemo, useState } from "react"
import { Check, ChevronRight, Download, Search, X } from "lucide-react"

import { cn } from "@/lib/utils"

import { MEMBERS, type ActivityAction } from "../_mock"
import { ACTION_META, Avatar, KindIcon, SORTED, daysAgo, sentence } from "./shared"

const RANGES = [
  { key: "1", label: "오늘", days: 1 },
  { key: "7", label: "7일", days: 7 },
  { key: "30", label: "30일", days: 30 },
  { key: "all", label: "전체", days: Infinity },
] as const

function stamp(iso: string) {
  const t = new Date(iso)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(t.getMonth() + 1)}.${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`
}

function CheckBox({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded border border-input transition-colors",
        on && "border-primary bg-primary text-primary-foreground",
      )}
    >
      {on && <Check className="size-3" strokeWidth={3} />}
    </span>
  )
}

// 필터 열 + 감사 로그 표
export function VariantB() {
  const [q, setQ] = useState("")
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("30")
  const [people, setPeople] = useState<Set<string>>(new Set())
  const [actions, setActions] = useState<Set<ActivityAction>>(new Set())
  const [open, setOpen] = useState<string | null>("a6")

  const inRange = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)!.days
    return SORTED.filter((a) => daysAgo(a.at) < days)
  }, [range])

  const rows = inRange.filter(
    (a) =>
      (people.size === 0 || people.has(a.actor.id)) &&
      (actions.size === 0 || actions.has(a.action)) &&
      (q === "" || a.target.toLowerCase().includes(q.toLowerCase())),
  )

  const toggle = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => {
    const n = new Set(set)
    if (n.has(v)) n.delete(v)
    else n.add(v)
    apply(n)
  }

  const actionKeys = (Object.keys(ACTION_META) as ActivityAction[]).filter((k) =>
    SORTED.some((a) => a.action === k),
  )
  const filtered = people.size + actions.size > 0 || q !== ""

  return (
    <div className="flex gap-8">
      <aside className="w-56 shrink-0 space-y-6 text-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            data-testid="pg-activity-page-b-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="항목 이름"
            className="h-8 w-full rounded-md border border-input bg-background pr-2 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>

        <div>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">기간</h3>
          <div className="grid grid-cols-4 gap-0.5 rounded-md border bg-muted/50 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                data-testid={`pg-activity-page-b-range-${r.key}`}
                onClick={() => setRange(r.key)}
                className={cn(
                  "rounded px-1 py-1 text-xs text-muted-foreground",
                  range === r.key && "bg-background text-foreground shadow-sm",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">사람</h3>
          <ul>
            {MEMBERS.map((m) => {
              const n = inRange.filter((a) => a.actor.id === m.id).length
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    data-testid={`pg-activity-page-b-person-${m.id}`}
                    onClick={() => toggle(people, m.id, setPeople)}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/60"
                  >
                    <CheckBox on={people.has(m.id)} />
                    <Avatar m={m} size={20} />
                    <span className={cn("flex-1 truncate text-left", n === 0 && "text-muted-foreground")}>{m.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{n}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">동작</h3>
          <ul>
            {actionKeys.map((k) => {
              const meta = ACTION_META[k]
              const n = inRange.filter((a) => a.action === k).length
              return (
                <li key={k}>
                  <button
                    type="button"
                    data-testid={`pg-activity-page-b-action-${k}`}
                    onClick={() => toggle(actions, k, setActions)}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/60"
                  >
                    <CheckBox on={actions.has(k)} />
                    <span className={cn("size-2 rounded-full", meta.dot)} />
                    <span className={cn("flex-1 text-left", n === 0 && "text-muted-foreground")}>{meta.label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{n}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="mb-4 flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">활동 로그</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
            {rows.length}
          </span>
          <div className="flex-1" />
          {filtered && (
            <button
              type="button"
              data-testid="pg-activity-page-b-clear"
              onClick={() => {
                setPeople(new Set())
                setActions(new Set())
                setQ("")
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
              필터 초기화
            </button>
          )}
          <button
            type="button"
            data-testid="pg-activity-page-b-export"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-sm hover:bg-muted"
          >
            <Download className="size-4" />
            CSV
          </button>
        </header>

        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="w-8" />
                <th className="w-28 py-2 pr-4 font-medium">시각</th>
                <th className="w-28 py-2 pr-4 font-medium">사용자</th>
                <th className="w-28 py-2 pr-4 font-medium">동작</th>
                <th className="py-2 pr-4 font-medium">항목</th>
                <th className="w-40 py-2 pr-4 font-medium">상세</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const meta = ACTION_META[a.action]
                const isOpen = open === a.id
                return (
                  <Fragment key={a.id}>
                    <tr
                      data-testid={`pg-activity-page-b-row-${a.id}`}
                      onClick={() => setOpen(isOpen ? null : a.id)}
                      className={cn(
                        "cursor-pointer border-b last:border-b-0 hover:bg-muted/40",
                        isOpen && "border-b-0 bg-muted/40",
                      )}
                    >
                      <td className="pl-3">
                        <ChevronRight
                          className={cn("size-3.5 text-muted-foreground transition-transform", isOpen && "rotate-90")}
                        />
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                        {stamp(a.at)}
                      </td>
                      <td className="py-2 pr-4">
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <Avatar m={a.actor} size={20} />
                          {a.actor.name}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
                            meta.tone,
                          )}
                        >
                          <meta.icon className="size-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span className="flex min-w-0 items-center gap-2">
                          <KindIcon kind={a.targetKind} size="sm" />
                          <span className="truncate">{a.target}</span>
                        </span>
                      </td>
                      <td className="truncate py-2 pr-4 text-xs text-muted-foreground">{a.detail ?? ""}</td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b bg-muted/40 last:border-b-0">
                        <td />
                        <td colSpan={5} className="pr-4 pb-3">
                          <div className="rounded-md border bg-background p-3">
                            <p className="text-sm text-muted-foreground">
                              {sentence(a, {
                                actor: (m) => <span className="font-medium text-foreground">{m.name}</span>,
                                target: (n) => <span className="font-medium text-foreground">{n}</span>,
                              })}
                            </p>
                            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-xs">
                              <dt className="text-muted-foreground">시각</dt>
                              <dd className="tabular-nums">
                                {new Date(a.at).toLocaleString("ko-KR", { dateStyle: "long", timeStyle: "short" })}
                              </dd>
                              <dt className="text-muted-foreground">사용자</dt>
                              <dd>{a.actor.email}</dd>
                              <dt className="text-muted-foreground">이벤트</dt>
                              <dd className="font-mono">{`node.${a.action}`}</dd>
                            </dl>
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                data-testid={`pg-activity-page-b-row-${a.id}-open`}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                              >
                                항목 열기
                              </button>
                              <button
                                type="button"
                                data-testid={`pg-activity-page-b-row-${a.id}-same-target`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setQ(a.target)
                                }}
                                className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                              >
                                이 항목의 활동
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-sm text-muted-foreground">
                    활동 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
