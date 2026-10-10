"use client"

import { useEffect, useRef, useState } from "react"
import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  Presentation,
  type LucideIcon,
} from "lucide-react"

import { AppIcon } from "@/components/ui-custom/app-icon"
import { cn } from "@/lib/utils"

import { LINK, ME, NODES, type MockKind, type MockNode } from "../_mock"

export type PublicState = "password" | "file" | "folder" | "expired"

export const STATES: { key: PublicState; label: string }[] = [
  { key: "password", label: "비밀번호" },
  { key: "file", label: "단일 파일" },
  { key: "folder", label: "폴더" },
  { key: "expired", label: "만료됨" },
]

export const SHARER = ME
export const FILE = NODES.find((n) => n.id === "n-deck")!
export const FOLDER = NODES.find((n) => n.id === "f-photos")!

const PHOTO_BG = [
  "linear-gradient(140deg, #f6d8a8 0%, #e39b6b 50%, #7b4a5f 100%)",
  "linear-gradient(160deg, #cfe3e8 0%, #8fb3ba 50%, #3d5a63 100%)",
  "linear-gradient(120deg, #d9e4c7 0%, #8fa775 55%, #3f5236 100%)",
  "linear-gradient(200deg, #f2e1c9 0%, #c9a77c 50%, #6b5440 100%)",
  "linear-gradient(150deg, #d5d9f0 0%, #8d93c7 50%, #3b3f6e 100%)",
  "linear-gradient(170deg, #f5c8c0 0%, #d4877c 50%, #6e3a3a 100%)",
  "linear-gradient(130deg, #c8e6dc 0%, #6fb39b 50%, #2e5c4d 100%)",
  "linear-gradient(190deg, #ece4d4 0%, #b8a88a 50%, #5a4e3c 100%)",
]

/** 폴더 링크에 보여줄 가짜 사진 목록 (전체 186개 중 일부) */
export const PHOTOS: MockNode[] = Array.from({ length: 16 }, (_, i) => ({
  id: `p${i}`,
  name: i === 3 ? "단체사진_최종.jpg" : i === 9 ? "일정표.pdf" : `IMG_${4120 + i * 7}.jpg`,
  kind: (i === 9 ? "pdf" : "image") as MockKind,
  parentId: FOLDER.id,
  size: 2_100_000 + ((i * 731_000) % 4_800_000),
  updatedAt: FOLDER.updatedAt,
  owner: ME.id,
  sharedWith: 0,
  thumb: i === 9 ? undefined : PHOTO_BG[i % PHOTO_BG.length],
}))

/** "10월 17일 (토)" */
export function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })
}

export const EXPIRES = formatDay(LINK.expiresAt)
export const EXPIRED_AT = formatDay(new Date(new Date("2026-10-10T00:00:00+09:00").getTime() - 2 * 86400_000).toISOString())

export function daysLeft() {
  const now = new Date("2026-10-10T17:00:00+09:00").getTime()
  return Math.max(0, Math.ceil((new Date(LINK.expiresAt).getTime() - now) / 86400_000))
}

const KIND: Record<MockKind, { icon: LucideIcon; tone: string; label: string }> = {
  folder: { icon: Folder, tone: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300", label: "폴더" },
  image: { icon: FileImage, tone: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300", label: "이미지" },
  pdf: { icon: FileText, tone: "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300", label: "PDF" },
  doc: { icon: FileText, tone: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300", label: "문서" },
  sheet: { icon: FileSpreadsheet, tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300", label: "스프레드시트" },
  slide: { icon: Presentation, tone: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300", label: "프레젠테이션" },
  video: { icon: FileVideo, tone: "bg-pink-50 text-pink-600 dark:bg-pink-950/50 dark:text-pink-300", label: "동영상" },
  audio: { icon: FileAudio, tone: "bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-300", label: "오디오" },
  archive: { icon: FileArchive, tone: "bg-stone-100 text-stone-600 dark:bg-stone-800/60 dark:text-stone-300", label: "압축 파일" },
  code: { icon: FileCode, tone: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300", label: "코드" },
  text: { icon: File, tone: "bg-muted text-muted-foreground", label: "텍스트" },
}

export function kindLabel(kind: MockKind) {
  return KIND[kind].label
}

export function KindIcon({ kind, className, iconClassName }: { kind: MockKind; className?: string; iconClassName?: string }) {
  const { icon: Icon, tone } = KIND[kind]
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-lg", tone, className)}>
      <Icon className={cn("size-4", iconClassName)} />
    </span>
  )
}

export function Avatar({ className }: { className?: string }) {
  return (
    <span
      className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white", className)}
      style={{ background: SHARER.color }}
    >
      {SHARER.name[0]}
    </span>
  )
}

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 text-sm font-semibold tracking-tight", className)}>
      <AppIcon alt="Ashfield" size={22} className="size-[22px] rounded-md" />
      Ashfield Drive
    </span>
  )
}

/** 슬라이드 미리보기 대용 */
export function SlidePreview({ className, page = 1, style }: { className?: string; page?: number; style?: React.CSSProperties }) {
  return (
    <div
      style={style}
      className={cn("relative aspect-video overflow-hidden rounded-lg shadow-sm ring-1 ring-black/5", className)}
    >
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #1f2a24 0%, #3f4a3c 55%, #8a9a6b 100%)" }} />
      <div className="absolute inset-0 flex flex-col justify-between p-[7%] text-white">
        <span className="text-[0.55em] font-medium uppercase tracking-[0.2em] opacity-70">Ashfield Lab</span>
        <div>
          <p className="text-[1.6em] font-semibold leading-tight">{page === 1 ? "투자 제안서" : `${page}. 시장 개요`}</p>
          <p className="mt-1 text-[0.7em] opacity-70">2026. 10</p>
        </div>
        <span className="self-end text-[0.5em] opacity-60">{page} / 24</span>
      </div>
    </div>
  )
}

/** 가짜 다운로드 진행률. null 이면 대기 */
export function useFakeDownload() {
  const [progress, setProgress] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current)
  }, [])
  function start() {
    if (timer.current) clearInterval(timer.current)
    setProgress(0)
    timer.current = setInterval(() => {
      setProgress((p) => {
        const next = (p ?? 0) + 7 + Math.random() * 9
        if (next >= 100) {
          if (timer.current) clearInterval(timer.current)
          setTimeout(() => setProgress(null), 900)
          return 100
        }
        return next
      })
    }, 160)
  }
  return { progress, start }
}

/** 가짜 비밀번호 확인: 4자 미만이면 실패 */
export function usePasswordGate(onPass: () => void) {
  const [value, setValue] = useState("")
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  function submit() {
    if (!value || busy) return
    setBusy(true)
    setError(false)
    setTimeout(() => {
      setBusy(false)
      if (value.length < 4) {
        setError(true)
        return
      }
      setValue("")
      onPass()
    }, 700)
  }
  return { value, setValue: (v: string) => { setValue(v); setError(false) }, error, busy, submit }
}

/** 브라우저 창 모양 틀 + 상태 전환 토글 */
export function BrowserFrame({
  state,
  onState,
  children,
  className,
}: {
  state: PublicState
  onState: (s: PublicState) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[560px] flex-col overflow-hidden rounded-xl border bg-background shadow-sm">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b bg-muted/50 px-3">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
        </div>
        <div className="mx-auto w-full max-w-md truncate rounded-md bg-background px-3 py-1 text-center font-mono text-[11px] text-muted-foreground ring-1 ring-border">
          {LINK.url.replace("https://", "")}
        </div>
        <div className="flex shrink-0 rounded-md bg-background p-0.5 ring-1 ring-border">
          {STATES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onState(s.key)}
              data-testid={`pg-public-link-state-${s.key}`}
              className={cn(
                "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                state === s.key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className={cn("relative flex min-h-0 flex-1 flex-col", className)}>{children}</div>
    </div>
  )
}
