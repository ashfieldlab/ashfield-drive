"use client"

import { useEffect, useState } from "react"
import {
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  Maximize2,
  Pause,
  Play,
  Presentation,
  Volume2,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

import { NODES, formatBytes, memberOf, relativeTime, type MockKind, type MockNode } from "../_mock"

/** 미리보기 대상: 폴더 제외 모든 파일 */
export const FILES: MockNode[] = NODES.filter((n) => n.kind !== "folder")

export const KIND_META: Record<MockKind, { icon: LucideIcon; label: string; tone: string }> = {
  folder: { icon: Folder, label: "폴더", tone: "text-muted-foreground" },
  image: { icon: FileImage, label: "이미지", tone: "text-violet-600 dark:text-violet-400" },
  pdf: { icon: FileText, label: "PDF", tone: "text-rose-600 dark:text-rose-400" },
  doc: { icon: FileText, label: "문서", tone: "text-blue-600 dark:text-blue-400" },
  sheet: { icon: FileSpreadsheet, label: "스프레드시트", tone: "text-emerald-600 dark:text-emerald-400" },
  slide: { icon: Presentation, label: "프레젠테이션", tone: "text-amber-600 dark:text-amber-400" },
  video: { icon: FileVideo, label: "동영상", tone: "text-pink-600 dark:text-pink-400" },
  audio: { icon: FileAudio, label: "오디오", tone: "text-teal-600 dark:text-teal-400" },
  archive: { icon: FileArchive, label: "압축 파일", tone: "text-orange-600 dark:text-orange-400" },
  code: { icon: FileCode, label: "코드", tone: "text-sky-600 dark:text-sky-400" },
  text: { icon: FileText, label: "텍스트", tone: "text-muted-foreground" },
}

export function KindIcon({ kind, className }: { kind: MockKind; className?: string }) {
  const { icon: Icon, tone } = KIND_META[kind]
  return <Icon className={cn("size-4 shrink-0", tone, className)} />
}

export function pathOf(node: MockNode): string {
  if (!node.parentId) return "내 파일"
  const parent = NODES.find((n) => n.id === node.parentId)
  return `내 파일 / ${parent?.name ?? ""}`
}

export function extOf(name: string): string {
  const i = name.lastIndexOf(".")
  return i < 0 ? "" : name.slice(i + 1).toUpperCase()
}

export function Avatar({ id, size = "size-6" }: { id: string; size?: string }) {
  const m = memberOf(id)
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center rounded-full text-[10px] font-semibold", size)}
      style={{ background: m.color, color: "#fff" }}
      title={m.name}
    >
      {m.name.slice(0, 1)}
    </span>
  )
}

/** 화살표 키로 이전/다음, Esc 로 닫기 */
export function usePreviewNav(count: number, onClose?: () => void, initial = 0) {
  const [index, setIndex] = useState(initial)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % count)
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + count) % count)
      if (e.key === "Escape") onClose?.()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [count, onClose])
  return {
    index,
    setIndex,
    prev: () => setIndex((i) => (i - 1 + count) % count),
    next: () => setIndex((i) => (i + 1) % count),
  }
}

/** 미리보기 뒤에 깔리는 흐릿한 파일 목록 */
export function FakeFileList({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none select-none", className)} aria-hidden>
      <div className="mb-5 flex items-center justify-between">
        <div className="h-6 w-28 rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-8 w-20 rounded-md bg-muted" />
          <div className="h-8 w-24 rounded-md bg-muted" />
        </div>
      </div>
      <div className="divide-y rounded-lg border">
        {NODES.filter((n) => !n.parentId).map((n) => (
          <div key={n.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <KindIcon kind={n.kind} />
            <span className="flex-1 truncate text-foreground">{n.name}</span>
            <span className="w-24 text-xs text-muted-foreground">{relativeTime(n.updatedAt)}</span>
            <span className="w-20 text-right text-xs text-muted-foreground">{formatBytes(n.size)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const DEPLOY_SH = `#!/usr/bin/env bash
set -euo pipefail

APP=ashfield-drive
TAG=\${1:-latest}

echo "[deploy] \${APP}:\${TAG}"
docker compose pull web api
docker compose up -d --remove-orphans

# 헬스체크
for i in $(seq 1 30); do
  if curl -fsS http://localhost:3200/healthz >/dev/null; then
    echo "[deploy] ok"
    exit 0
  fi
  sleep 2
done

echo "[deploy] healthcheck failed" >&2
exit 1`

const MEMO_TXT = `10/08 회의
- 랜딩 페이지 카피 수정 (이서준)
- 투자 제안서 v3 검토, 금요일까지
- 워크숍 사진 정리 후 공유 링크 발급

할 일
[x] 브랜드 가이드 PDF 업로드
[ ] 4분기 예산 시트 승인
[ ] 고객 인터뷰 녹취 요약`

const ZIP_ENTRIES = [
  { name: "index.html", size: 18_400 },
  { name: "assets/", size: 0 },
  { name: "assets/hero.webp", size: 412_000 },
  { name: "assets/app.js", size: 2_380_000 },
  { name: "assets/app.css", size: 96_000 },
  { name: "robots.txt", size: 120 },
]

/** 파일 종류별 가짜 미리보기. tone=dark 는 라이트박스처럼 어두운 배경 위 */
export function PreviewBody({ node, compact = false }: { node: MockNode; compact?: boolean }) {
  switch (node.kind) {
    case "image":
      return (
        <div
          className={cn(
            "aspect-[4/3] w-full rounded-md shadow-2xl ring-1 ring-foreground/10",
            compact ? "max-w-md" : "max-h-full max-w-3xl",
          )}
          style={{ background: node.thumb }}
        />
      )
    case "pdf":
      return <PdfPages compact={compact} />
    case "doc":
      return <DocPage node={node} compact={compact} />
    case "sheet":
      return <SheetGrid />
    case "slide":
      return <SlideFrame compact={compact} />
    case "video":
      return <VideoPlayer compact={compact} />
    case "audio":
      return <AudioPlayer node={node} />
    case "code":
    case "text":
      return <CodeView text={node.kind === "code" ? DEPLOY_SH : MEMO_TXT} numbered={node.kind === "code"} />
    default:
      return <Unsupported node={node} />
  }
}

function Lines({ widths }: { widths: number[] }) {
  return (
    <div className="space-y-1.5">
      {widths.map((w, i) => (
        <div key={i} className="h-1.5 rounded-full bg-muted-foreground/15" style={{ width: `${w}%` }} />
      ))}
    </div>
  )
}

function PdfPages({ compact }: { compact: boolean }) {
  return (
    <div className={cn("flex w-full flex-col items-center gap-4", compact ? "max-w-sm" : "max-w-xl")}>
      {[0, 1, 2].map((p) => (
        <div key={p} className="aspect-[1/1.414] w-full rounded-sm bg-card p-[8%] shadow-lg ring-1 ring-foreground/10">
          {p === 0 ? (
            <div className="flex h-full flex-col">
              <div className="h-1/2 rounded-sm" style={{ background: "linear-gradient(135deg, #3f4a3c, #8a9a6b)" }} />
              <p className="mt-6 text-xl font-bold tracking-tight text-foreground">Brand Guide</p>
              <p className="mt-1 text-xs text-muted-foreground">Ashfield, 2026</p>
              <div className="mt-auto">
                <Lines widths={[40, 30]} />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="h-3 w-1/3 rounded bg-muted-foreground/25" />
              <Lines widths={[100, 96, 98, 72]} />
              <div className="grid grid-cols-5 gap-1.5">
                {["#3f4a3c", "#8a9a6b", "#d8cfae", "#c27c4e", "#2f3b4a"].map((c) => (
                  <div key={c} className="aspect-square rounded-sm" style={{ background: c }} />
                ))}
              </div>
              <Lines widths={[100, 92, 97, 60, 100, 88]} />
            </div>
          )}
          <div className="sr-only">{p + 1}</div>
        </div>
      ))}
    </div>
  )
}

function DocPage({ node, compact }: { node: MockNode; compact: boolean }) {
  return (
    <div
      className={cn(
        "w-full rounded-sm bg-card px-[9%] py-[8%] text-foreground shadow-lg ring-1 ring-foreground/10",
        compact ? "max-w-sm text-[9px]" : "max-w-2xl text-sm",
      )}
    >
      <p className={cn("font-bold tracking-tight", compact ? "text-sm" : "text-2xl")}>{node.name.replace(/\.[^.]+$/, "")}</p>
      <p className="mt-1 text-muted-foreground">{memberOf(node.owner).name}, {relativeTime(node.updatedAt)}</p>
      <p className={cn("font-semibold", compact ? "mt-3" : "mt-8 text-base")}>1. 개요</p>
      <p className="mt-2 leading-relaxed text-muted-foreground">
        2027년에는 팀 단위 협업 기능을 중심으로 유료 전환율을 높이고, 보안 폴더와 공유 링크 정책을 기업 고객 요구에 맞게 확장한다.
      </p>
      <p className={cn("font-semibold", compact ? "mt-3" : "mt-6 text-base")}>2. 핵심 목표</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
        <li>월간 활성 워크스페이스 3,000개</li>
        <li>유료 전환율 4.2% → 6%</li>
        <li>평균 응답 시간 120ms 이하</li>
      </ul>
      <div className={compact ? "mt-3" : "mt-6"}>
        <Lines widths={[100, 94, 98, 66]} />
      </div>
    </div>
  )
}

function SheetGrid() {
  const cols = ["", "A", "B", "C", "D", "E"]
  const rows = [
    ["항목", "10월", "11월", "12월", "합계"],
    ["인건비", "42,000", "42,000", "45,500", "129,500"],
    ["클라우드", "8,120", "8,400", "9,050", "25,570"],
    ["마케팅", "6,000", "12,000", "9,500", "27,500"],
    ["장비", "2,400", "0", "3,800", "6,200"],
    ["기타", "1,150", "980", "1,300", "3,430"],
    ["합계", "59,670", "63,380", "69,150", "192,200"],
  ]
  return (
    <div className="w-full max-w-2xl overflow-hidden rounded-md bg-card text-xs shadow-lg ring-1 ring-foreground/10">
      <table className="w-full border-collapse tabular-nums">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} className="border-b border-r bg-muted px-2 py-1 font-medium text-muted-foreground last:border-r-0">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="w-8 border-r border-b bg-muted px-2 py-1.5 text-center text-muted-foreground">{i + 1}</td>
              {r.map((v, j) => (
                <td
                  key={j}
                  className={cn(
                    "border-b border-r px-2 py-1.5 last:border-r-0",
                    j > 0 && "text-right",
                    (i === 0 || i === rows.length - 1) && "font-semibold",
                  )}
                >
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SlideFrame({ compact }: { compact: boolean }) {
  return (
    <div className={cn("w-full", compact ? "max-w-md" : "max-w-3xl")}>
      <div
        className="flex aspect-video w-full flex-col justify-end rounded-md p-[6%] shadow-2xl ring-1 ring-foreground/10"
        style={{ background: "linear-gradient(135deg, #1f2a24 0%, #3f4a3c 55%, #8a9a6b 100%)" }}
      >
        <p className={cn("font-bold tracking-tight text-[#f3efe4]", compact ? "text-base" : "text-3xl")}>Ashfield Drive</p>
        <p className={cn("mt-1 text-[#d8cfae]", compact ? "text-[10px]" : "text-sm")}>투자 제안서, 2026 하반기</p>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground tabular-nums">1 / 18</p>
    </div>
  )
}

function VideoPlayer({ compact }: { compact: boolean }) {
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(34)
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setT((v) => (v >= 212 ? 0 : v + 1)), 1000)
    return () => clearInterval(id)
  }, [playing])
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
  return (
    <div
      className={cn(
        "group relative aspect-video w-full overflow-hidden rounded-md shadow-2xl ring-1 ring-foreground/10",
        compact ? "max-w-md" : "max-w-3xl",
      )}
      style={{ background: "radial-gradient(120% 90% at 30% 20%, #3b4a5c 0%, #18202a 60%, #0b0f14 100%)" }}
    >
      <div className="absolute inset-[18%_22%] rounded-lg border border-[#ffffff22] bg-[#ffffff0d]" />
      <button
        type="button"
        data-testid="pg-file-preview-video-play"
        onClick={() => setPlaying((p) => !p)}
        className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#000000aa] text-[#ffffff] backdrop-blur transition hover:scale-105"
      >
        {playing ? <Pause className="size-6" /> : <Play className="size-6 translate-x-0.5" />}
      </button>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#000000cc] to-transparent px-3 pb-2 pt-8 text-[#ffffff]">
        <div className="relative h-1 rounded-full bg-[#ffffff40]">
          <div className="absolute inset-y-0 left-0 rounded-full bg-[#ffffff66]" style={{ width: "62%" }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-[#ffffff]" style={{ width: `${(t / 212) * 100}%` }} />
        </div>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] tabular-nums">
          <button type="button" data-testid="pg-file-preview-video-toggle" onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </button>
          <Volume2 className="size-3.5" />
          <span>
            {fmt(t)} / {fmt(212)}
          </span>
          <span className="ml-auto rounded bg-[#ffffff26] px-1 text-[10px]">1080p</span>
          <Maximize2 className="size-3.5" />
        </div>
      </div>
    </div>
  )
}

const WAVE = Array.from({ length: 96 }, (_, i) => {
  const v = Math.abs(Math.sin(i * 0.37) * 0.6 + Math.sin(i * 0.11 + 1) * 0.35 + Math.sin(i * 1.7) * 0.15)
  return Math.max(0.08, Math.min(1, v))
})

function AudioPlayer({ node }: { node: MockNode }) {
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(28)
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setPos((p) => (p >= WAVE.length - 1 ? 0 : p + 1)), 300)
    return () => clearInterval(id)
  }, [playing])
  return (
    <div className="w-full max-w-2xl rounded-xl bg-card p-6 shadow-lg ring-1 ring-foreground/10">
      <div className="flex items-center gap-4">
        <button
          type="button"
          data-testid="pg-file-preview-audio-play"
          onClick={() => setPlaying((p) => !p)}
          className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90"
        >
          {playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-0.5" />}
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{node.name}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {Math.floor((pos / WAVE.length) * 42)}:{String(Math.floor(((pos / WAVE.length) * 42 * 60) % 60)).padStart(2, "0")} / 42:07
          </p>
        </div>
      </div>
      <div className="mt-5 flex h-20 items-center gap-[3px]">
        {WAVE.map((v, i) => (
          <button
            key={i}
            type="button"
            data-testid={`pg-file-preview-wave-${i}`}
            onClick={() => setPos(i)}
            className={cn(
              "flex-1 rounded-full transition-colors",
              i <= pos ? "bg-teal-600 dark:bg-teal-400" : "bg-muted-foreground/25 hover:bg-muted-foreground/40",
            )}
            style={{ height: `${v * 100}%` }}
          />
        ))}
      </div>
    </div>
  )
}

function CodeView({ text, numbered }: { text: string; numbered: boolean }) {
  const lines = text.split("\n")
  return (
    <div className="w-full max-w-3xl overflow-hidden rounded-md bg-card shadow-lg ring-1 ring-foreground/10">
      <pre className="overflow-auto py-3 font-mono text-xs leading-5 text-foreground">
        {lines.map((l, i) => (
          <div key={i} className="flex">
            {numbered && <span className="w-10 shrink-0 select-none pr-3 text-right text-muted-foreground/60">{i + 1}</span>}
            <span
              className={cn(
                "whitespace-pre pr-4",
                !numbered && "pl-4",
                numbered && l.trimStart().startsWith("#") && "text-muted-foreground",
                numbered && /^(echo|docker|exit)/.test(l.trim()) && "text-sky-700 dark:text-sky-300",
              )}
            >
              {l || " "}
            </span>
          </div>
        ))}
      </pre>
    </div>
  )
}

function Unsupported({ node }: { node: MockNode }) {
  return (
    <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-lg ring-1 ring-foreground/10">
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-lg bg-orange-50 dark:bg-orange-950/50">
          <KindIcon kind={node.kind} className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{node.name}</p>
          <p className="text-xs text-muted-foreground">미리보기 없음, {formatBytes(node.size)}</p>
        </div>
      </div>
      {node.kind === "archive" && (
        <div className="mt-4 divide-y rounded-md border text-xs">
          {ZIP_ENTRIES.map((e) => (
            <div key={e.name} className="flex items-center gap-2 px-3 py-1.5">
              <span className="flex-1 truncate font-mono text-foreground">{e.name}</span>
              <span className="text-muted-foreground tabular-nums">{e.size ? formatBytes(e.size) : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 필름스트립/목록용 작은 썸네일 */
export function Thumb({ node, className }: { node: MockNode; className?: string }) {
  if (node.thumb) return <div className={cn("rounded", className)} style={{ background: node.thumb }} />
  return (
    <div className={cn("grid place-items-center rounded bg-muted", className)}>
      <KindIcon kind={node.kind} className="size-5" />
    </div>
  )
}
