"use client"

import { useMemo, useState } from "react"
import { ArrowUpRight } from "lucide-react"

import { cn } from "@/lib/utils"

import { MEMBERS, ME } from "../_mock"
import {
  ACTION_META,
  Avatar,
  KindIcon,
  SORTED,
  clock,
  dateLabel,
  dayBucket,
  sentence,
  thumbOf,
} from "./shared"

const SCOPES = [
  { key: "all", label: "전체" },
  { key: "me", label: "내 활동" },
  { key: "others", label: "다른 사람" },
] as const

const BUCKETS = ["오늘", "어제", "이번 주", "이전"]

// 날짜별 타임라인
export function VariantA() {
  const [scope, setScope] = useState<(typeof SCOPES)[number]["key"]>("all")
  const [active, setActive] = useState<string | null>(null)

  const groups = useMemo(() => {
    const items = SORTED.filter((a) =>
      scope === "all" ? true : scope === "me" ? a.actor.id === ME.id : a.actor.id !== ME.id,
    )
    return BUCKETS.map((b) => ({ label: b, items: items.filter((a) => dayBucket(a.at) === b) })).filter(
      (g) => g.items.length > 0,
    )
  }, [scope])

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 flex items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">활동</h1>
        <div className="inline-flex rounded-lg border bg-muted/50 p-0.5 text-sm">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              type="button"
              data-testid={`pg-activity-page-a-scope-${s.key}`}
              onClick={() => setScope(s.key)}
              className={cn(
                "rounded-md px-3 py-1 text-muted-foreground transition-colors",
                scope === s.key && "bg-background text-foreground shadow-sm",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-10">
        {groups.map((g) => (
          <section key={g.label}>
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="text-sm font-semibold">{g.label}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">{g.items.length}</span>
            </div>
            <ol className="relative">
              {g.items.map((a, i) => {
                const meta = ACTION_META[a.action]
                const ActionIcon = meta.icon
                const thumb = a.action === "upload" ? thumbOf(a.target) : undefined
                const sharedWith =
                  a.action === "share"
                    ? (a.detail ?? "")
                        .split(",")
                        .map((s) => MEMBERS.find((m) => m.name === s.trim()))
                        .filter((m) => m !== undefined)
                    : []
                const last = i === g.items.length - 1
                return (
                  <li key={a.id} className="relative flex gap-4 pb-1">
                    {!last && <span className="absolute top-10 bottom-0 left-[17px] w-px bg-border" />}
                    <div className="relative mt-1.5 shrink-0 self-start">
                      <Avatar m={a.actor} size={36} />
                      <span
                        className={cn(
                          "absolute -right-1.5 -bottom-1.5 inline-flex size-5 items-center justify-center rounded-full ring-2 ring-background",
                          meta.tone,
                        )}
                      >
                        <ActionIcon className="size-2.5" />
                      </span>
                    </div>
                    <div
                      className={cn(
                        "-mx-2 mb-2 min-w-0 flex-1 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50",
                        active === a.id && "bg-muted/60 hover:bg-muted/60",
                      )}
                    >
                    <button
                      type="button"
                      data-testid={`pg-activity-page-a-row-${a.id}`}
                      onClick={() => setActive(active === a.id ? null : a.id)}
                      className="flex w-full flex-col text-left"
                    >
                      <div className="flex w-full items-start gap-3">
                        <p className="min-w-0 flex-1 text-sm leading-6 text-muted-foreground">
                          {sentence(a, {
                            actor: (m) => <span className="font-medium text-foreground">{m.name}</span>,
                            target: (name) => (
                              <span className="mr-px ml-0.5 inline-flex max-w-full translate-y-[3px] items-center gap-1.5 rounded-md border bg-card py-0.5 pr-2 pl-1 align-baseline text-[13px] leading-4 font-medium text-foreground">
                                <KindIcon kind={a.targetKind} size="sm" />
                                <span className="truncate">{name}</span>
                              </span>
                            ),
                          })}
                        </p>
                        <time
                          className="shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums"
                          title={dateLabel(a.at)}
                        >
                          {g.label === "오늘" || g.label === "어제" ? clock(a.at) : dateLabel(a.at)}
                        </time>
                      </div>
                      {thumb && (
                        <span
                          className="mt-3 block h-24 w-40 rounded-lg border shadow-sm"
                          style={{ background: thumb }}
                        />
                      )}
                      {sharedWith.length > 0 && (
                        <span className="mt-2 flex items-center gap-2">
                          <span className="flex -space-x-1.5">
                            {sharedWith.map((m) => (
                              <Avatar key={m.id} m={m} size={22} className="ring-2 ring-background" />
                            ))}
                          </span>
                          <span className="text-xs text-muted-foreground">{a.detail}</span>
                        </span>
                      )}
                    </button>
                      {active === a.id && (
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            data-testid={`pg-activity-page-a-open-${a.id}`}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            열기
                            <ArrowUpRight className="size-3" />
                          </button>
                          <button
                            type="button"
                            data-testid={`pg-activity-page-a-locate-${a.id}`}
                            className="inline-flex items-center rounded-md border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            위치 보기
                          </button>
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
