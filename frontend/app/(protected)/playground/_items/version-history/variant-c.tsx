"use client"

import { useState } from "react"
import { FileText, RotateCcw, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { formatBytes, type MockNode } from "../_mock"
import { PreviewBody } from "../file-preview/shared"
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

// 텍스트 파일 데모: 버전마다 실제 내용이 달라서 브라우저에서 줄 단위로 비교할 수 있다
const TEXT_NAME = "회의록 1007.md"
const TEXT: Record<number, string[]> = {
  1: ["# 주간 회의 10/7", "", "참석: 김하늘, 이서준"],
  2: ["# 주간 회의 10/7", "", "참석: 김하늘, 이서준, 박지민", "", "## 안건", "- 4분기 예산"],
  3: ["# 주간 회의 10/7", "", "참석: 김하늘, 이서준, 박지민", "", "## 안건", "- 4분기 예산", "- 채용 계획"],
  4: [
    "# 주간 회의 10/7",
    "",
    "참석: 김하늘, 이서준, 박지민",
    "",
    "## 안건",
    "- 4분기 예산: 클라우드 비용 10% 절감",
    "- 채용 계획",
    "",
    "## 결정",
    "- 디자이너 1명 채용",
  ],
  5: [
    "# 주간 회의 10/7",
    "",
    "참석: 김하늘, 이서준, 박지민, 최도윤",
    "",
    "## 안건",
    "- 4분기 예산: 클라우드 비용 10% 절감",
    "- 채용 계획",
    "",
    "## 결정",
    "- 디자이너 1명 채용",
    "- 다음 회의 10/14",
  ],
  6: [
    "# 주간 회의 10/7",
    "",
    "참석: 김하늘, 이서준, 박지민, 최도윤",
    "",
    "## 안건",
    "- 4분기 예산: 클라우드 비용 15% 절감",
    "",
    "## 결정",
    "- 디자이너 1명, 백엔드 1명 채용",
    "- 다음 회의 10/14",
  ],
}

const TEXT_FILE: MockNode = { ...FILE, id: "n-minutes", name: TEXT_NAME, kind: "text" }

const baseNo = (v: Version) => v.restoredFrom ?? v.no
const textOf = (v: Version) => TEXT[baseNo(v)] ?? TEXT[6]

type Line = { kind: "same" | "add" | "del"; text: string }

/** LCS 기반 줄 비교: a(이 버전) → b(현재) */
function diffLines(a: string[], b: string[]): Line[] {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: Line[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: "del", text: a[i++] })
    else out.push({ kind: "add", text: b[j++] })
  }
  while (i < m) out.push({ kind: "del", text: a[i++] })
  while (j < n) out.push({ kind: "add", text: b[j++] })
  return out
}

/** C: 왼쪽 버전 목록 + 오른쪽 그 버전 미리보기. 텍스트 파일만 현재와 비교 */
export function VariantC() {
  const { versions, restore, download, downloading, downloaded } = useVersions()
  const [sel, setSel] = useState<string>("v3")
  const [asking, setAsking] = useState(false)
  const [demo, setDemo] = useState<"doc" | "text">("doc")
  const [mode, setMode] = useState<"preview" | "diff">("preview")

  const current = versions.find((v) => v.current)!
  const v = versions.find((x) => x.id === sel) ?? current
  const prog = downloading[v.id]
  const file = demo === "doc" ? FILE : TEXT_FILE
  const isText = demo === "text"
  const diff = isText && !v.current ? diffLines(textOf(v), textOf(current)) : []
  const adds = diff.filter((l) => l.kind === "add").length
  const dels = diff.filter((l) => l.kind === "del").length
  const showDiff = isText && mode === "diff" && !v.current

  return (
    <div className="flex flex-col items-center gap-3">
      <Segmented
        value={demo}
        onChange={(d) => {
          setDemo(d)
          setMode("preview")
        }}
        options={[
          { value: "doc", label: "문서 (docx)" },
          { value: "text", label: "텍스트 (md)" },
        ]}
        testId={`${T}-demo`}
      />
      <div className="flex h-[600px] w-[900px] max-w-[94vw] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b px-5">
          <FileText size={18} className={cn("shrink-0", isText ? "text-muted-foreground" : "text-blue-600 dark:text-blue-400")} />
          <h3 className="min-w-0 truncate text-sm font-semibold">{file.name}</h3>
          <span className="text-xs text-muted-foreground">버전 기록, {RETENTION_DAYS}일 보관</span>
          <div className="flex-1" />
          <button
            data-testid={`${T}-close`}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
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
                      <span className="block truncate text-[13px] font-medium">
                        {dayLabel(x.savedAt)} {formatTime(x.savedAt)}
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
                    <span className="rounded-full border px-2 py-px text-[11px] text-muted-foreground">v{v.restoredFrom}에서 복원</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {memberLabel(v.savedBy)}, {formatDateTime(v.savedAt)}, {formatBytes(v.size)}
                </p>
              </div>
              {isText && !v.current && (
                <Segmented
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "preview", label: "미리보기" },
                    { value: "diff", label: "현재와 비교" },
                  ]}
                  testId={`${T}-mode`}
                />
              )}
            </div>

            <div className="relative mx-6 min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/40">
              {showDiff ? (
                <div className="font-mono text-[12.5px] leading-6" data-testid={`${T}-diff`}>
                  <div className="sticky top-0 flex gap-3 border-b bg-background/95 px-4 py-1.5 font-sans text-xs backdrop-blur">
                    <span className="text-muted-foreground">v{v.no} → 현재 v{current.no}</span>
                    <span className="text-emerald-600 dark:text-emerald-400">+{adds}</span>
                    <span className="text-rose-600 dark:text-rose-400">-{dels}</span>
                  </div>
                  {diff.map((l, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex px-4",
                        l.kind === "add" && "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
                        l.kind === "del" && "bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
                      )}
                    >
                      <span className="w-5 shrink-0 text-muted-foreground select-none">
                        {l.kind === "add" ? "+" : l.kind === "del" ? "-" : ""}
                      </span>
                      <span className="whitespace-pre-wrap">{l.text || " "}</span>
                    </div>
                  ))}
                </div>
              ) : isText ? (
                <pre key={v.id} className="animate-in fade-in px-5 py-4 font-mono text-[12.5px] leading-6 whitespace-pre-wrap duration-200">
                  {textOf(v).join("\n")}
                </pre>
              ) : (
                <div key={v.id} className="animate-in fade-in flex min-h-full items-start justify-center p-6 duration-200">
                  <PreviewBody node={file} compact />
                </div>
              )}
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
    </div>
  )
}

function Segmented<V extends string>({
  value,
  onChange,
  options,
  testId,
}: {
  value: V
  onChange: (v: V) => void
  options: { value: V; label: string }[]
  testId: string
}) {
  return (
    <div className="inline-flex rounded-lg border bg-background p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          data-testid={`${testId}-${o.value}`}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

