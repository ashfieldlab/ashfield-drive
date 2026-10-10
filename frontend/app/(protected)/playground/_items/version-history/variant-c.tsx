"use client"

import { useState } from "react"
import { FileText, Minus, Pencil, Plus, RotateCcw, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { formatBytes } from "../_mock"
import {
  Avatar,
  Delta,
  DownloadGlyph,
  FILE,
  RETENTION_DAYS,
  dayLabel,
  deltaOf,
  formatDateTime,
  formatTime,
  memberLabel,
  useVersions,
  type Version,
} from "./shared"

const T = "pg-version-history-c"

// 미리보기용 가짜 문서 구조: 버전마다 있는 절과 바뀐 절
const SECTIONS = ["개요", "시장 분석", "제품 전략", "재무 계획", "실행 일정", "부록: 조직도"]
const SECTION_COUNT: Record<number, number> = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 6 }
const CHANGED: Record<number, string[]> = {
  2: ["개요"],
  3: ["시장 분석"],
  4: ["제품 전략", "개요"],
  5: ["실행 일정"],
  6: ["재무 계획"],
}

const baseNo = (v: Version) => v.restoredFrom ?? v.no
const sectionsOf = (v: Version) => SECTIONS.slice(0, SECTION_COUNT[baseNo(v)] ?? 6)

/** C: 왼쪽 버전 목록 + 오른쪽 미리보기와 현재 대비 요약 */
export function VariantC() {
  const { versions, restore, download, downloading, downloaded } = useVersions()
  const [sel, setSel] = useState<string>("v3")
  const [asking, setAsking] = useState(false)

  const current = versions.find((v) => v.current)!
  const v = versions.find((x) => x.id === sel) ?? current
  const prog = downloading[v.id]

  const mine = sectionsOf(v)
  const now = sectionsOf(current)
  const added = now.filter((s) => !mine.includes(s))
  const removed = mine.filter((s) => !now.includes(s))
  const changed = v.current
    ? []
    : [
        ...new Set(
          Object.entries(CHANGED)
            .filter(([no]) => Number(no) > baseNo(v) && Number(no) <= baseNo(current))
            .flatMap(([, s]) => s),
        ),
      ].filter((s) => mine.includes(s))
  const vsCurrent = v.size - current.size

  return (
    <div className="flex h-[600px] w-[900px] max-w-[94vw] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b px-5">
        <FileText size={18} className="shrink-0 text-blue-600 dark:text-blue-400" />
        <h3 className="min-w-0 truncate text-sm font-semibold">{FILE.name}</h3>
        <span className="text-xs text-muted-foreground">
          버전 기록 · {RETENTION_DAYS}일 보관
        </span>
        <div className="flex-1" />
        <button
          data-testid={`${T}-close`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 목록 */}
        <ul className="w-64 shrink-0 overflow-y-auto border-r bg-muted/30 p-2" data-testid={`${T}-list`}>
          {versions.map((x) => {
            const on = x.id === v.id
            return (
              <li key={x.id}>
                <button
                  onClick={() => {
                    setSel(x.id)
                    setAsking(false)
                  }}
                  data-testid={`${T}-item-${x.id}`}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left",
                    on ? "bg-background shadow-sm ring-1 ring-border" : "hover:bg-muted",
                  )}
                >
                  <Avatar m={x.savedBy} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium">
                        {dayLabel(x.savedAt)} {formatTime(x.savedAt)}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>v{x.no}</span>
                      <span className="tabular-nums">{formatBytes(x.size)}</span>
                      <Delta n={deltaOf(versions, x)} />
                    </span>
                  </span>
                  {x.current && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" title="현재" />}
                </button>
              </li>
            )
          })}
        </ul>

        {/* 상세 */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 px-6 pt-5 pb-4">
            <Avatar m={v.savedBy} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold">버전 {v.no}</span>
                {v.current && (
                  <span className="rounded-full bg-emerald-50 px-2 py-px text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    현재
                  </span>
                )}
                {v.restoredFrom && (
                  <span className="rounded-full border px-2 py-px text-[11px] text-muted-foreground">
                    v{v.restoredFrom}에서 복원
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {memberLabel(v.savedBy)} · {formatDateTime(v.savedAt)}
              </p>
            </div>
          </div>

          <dl className="mx-6 grid grid-cols-3 divide-x rounded-lg border text-sm">
            <Stat label="크기" value={formatBytes(v.size)} />
            <Stat label="이전 버전 대비" value={<Delta n={deltaOf(versions, v)} className="text-sm" />} />
            <Stat
              label="현재 버전 대비"
              value={v.current ? <span className="text-muted-foreground">-</span> : <Delta n={vsCurrent} className="text-sm" />}
            />
          </dl>

          <div className="flex min-h-0 flex-1 gap-5 px-6 pt-4">
            {/* 문서 미리보기 */}
            <div className="relative min-w-0 flex-1 overflow-hidden rounded-lg border bg-muted/50">
              <div key={v.id} className="animate-in fade-in absolute inset-x-6 top-5 rounded-sm bg-card px-6 py-5 shadow-md ring-1 ring-border/60 duration-200">
                <p className="text-[13px] font-bold">2027 사업계획</p>
                <div className="mt-1 h-1 w-16 rounded bg-muted-foreground/25" />
                {mine.map((s, i) => (
                  <div key={s} className="mt-3.5">
                    <p
                      className={cn(
                        "inline-block rounded-sm px-0.5 text-[10px] font-semibold",
                        changed.includes(s) && "bg-amber-100 dark:bg-amber-900/50",
                      )}
                    >
                      {i + 1}. {s}
                    </p>
                    <div className="mt-1 space-y-1">
                      {[92, 100, 76].slice(0, 2 + (i % 2)).map((w, j) => (
                        <div key={j} className="h-1 rounded bg-muted-foreground/15" style={{ width: `${w - j * 4}%` }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 현재 대비 요약 */}
            <div className="w-48 shrink-0 overflow-y-auto">
              <p className="text-xs font-medium text-muted-foreground">현재 버전과 다른 부분</p>
              {v.current ? (
                <p className="mt-3 text-xs text-muted-foreground">현재 버전</p>
              ) : added.length + removed.length + changed.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">차이 없음</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {changed.map((s) => (
                    <DiffRow key={`c-${s}`} kind="changed" label={s} />
                  ))}
                  {added.map((s) => (
                    <DiffRow key={`a-${s}`} kind="added" label={s} />
                  ))}
                  {removed.map((s) => (
                    <DiffRow key={`r-${s}`} kind="removed" label={s} />
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-4 flex h-14 shrink-0 items-center gap-2 border-t px-6">
            {asking ? (
              <>
                <RotateCcw size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-medium">v{v.no}</span>으로 복원
                  <span className="text-muted-foreground"> · 현재 버전은 기록에 남음</span>
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
                <Button
                  size="sm"
                  onClick={() => setAsking(true)}
                  disabled={v.current}
                  data-testid={`${T}-restore`}
                  className="gap-1.5"
                >
                  <RotateCcw size={14} /> 이 버전으로 복원
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-3.5 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function DiffRow({ kind, label }: { kind: "added" | "removed" | "changed"; label: string }) {
  const meta = {
    added: { icon: Plus, cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300", tag: "현재에 추가" },
    removed: { icon: Minus, cls: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300", tag: "현재에 없음" },
    changed: { icon: Pencil, cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300", tag: "수정됨" },
  }[kind]
  const Icon = meta.icon
  return (
    <li className="flex items-start gap-2 rounded-md px-1 py-1">
      <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded", meta.cls)}>
        <Icon size={11} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{meta.tag}</span>
      </span>
    </li>
  )
}
