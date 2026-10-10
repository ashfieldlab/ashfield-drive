"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
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

import { cn } from "@/lib/utils"

import { formatBytes, type MockKind } from "../_mock"

export type UpState = "queued" | "uploading" | "done" | "failed" | "canceled"

export interface Upload {
  id: string
  name: string
  kind: MockKind
  size: number
  loaded: number
  state: UpState
  /** 바이트/초 */
  speed: number
  dest: string
  /** 폴더 업로드: 하위 파일 수 */
  files?: number
  error?: string
}

const KIND_ICON: Record<MockKind, { icon: LucideIcon; tone: string }> = {
  folder: { icon: Folder, tone: "text-sky-600 dark:text-sky-400" },
  image: { icon: FileImage, tone: "text-violet-600 dark:text-violet-400" },
  pdf: { icon: FileText, tone: "text-rose-600 dark:text-rose-400" },
  doc: { icon: FileText, tone: "text-blue-600 dark:text-blue-400" },
  sheet: { icon: FileSpreadsheet, tone: "text-emerald-600 dark:text-emerald-400" },
  slide: { icon: Presentation, tone: "text-amber-600 dark:text-amber-400" },
  video: { icon: FileVideo, tone: "text-pink-600 dark:text-pink-400" },
  audio: { icon: FileAudio, tone: "text-teal-600 dark:text-teal-400" },
  archive: { icon: FileArchive, tone: "text-orange-600 dark:text-orange-400" },
  code: { icon: FileCode, tone: "text-sky-600 dark:text-sky-400" },
  text: { icon: FileText, tone: "text-muted-foreground" },
}

export function KindIcon({ kind, className }: { kind: MockKind; className?: string }) {
  const { icon: Icon, tone } = KIND_ICON[kind]
  return <Icon className={cn("size-4 shrink-0", tone, className)} />
}

const MB = 1024 * 1024

const SEED: Upload[] = [
  { id: "u1", name: "워크숍 단체사진.jpg", kind: "image", size: 8.4 * MB, loaded: 8.4 * MB, state: "done", speed: 0, dest: "내 파일" },
  { id: "u2", name: "제품 데모 최종.mp4", kind: "video", size: 640 * MB, loaded: 141 * MB, state: "uploading", speed: 21 * MB, dest: "내 파일" },
  { id: "u3", name: "디자인 시스템 v2", kind: "folder", size: 212 * MB, loaded: 74 * MB, state: "uploading", speed: 12 * MB, dest: "내 파일", files: 48 },
  { id: "u4", name: "4분기 보고서.pptx", kind: "slide", size: 46 * MB, loaded: 28.5 * MB, state: "failed", speed: 0, dest: "내 파일", error: "네트워크 연결 끊김" },
  { id: "u5", name: "고객 계약서 스캔.pdf", kind: "pdf", size: 18 * MB, loaded: 6 * MB, state: "uploading", speed: 9 * MB, dest: "계약서" },
  { id: "u6", name: "회의 녹음 1010.m4a", kind: "audio", size: 54 * MB, loaded: 0, state: "queued", speed: 0, dest: "회의록" },
  { id: "u7", name: "release-notes.md", kind: "text", size: 14_200, loaded: 0, state: "queued", speed: 0, dest: "내 파일" },
]

const DROP_BATCH: Omit<Upload, "id">[] = [
  { name: "스튜디오 촬영 원본.zip", kind: "archive", size: 380 * MB, loaded: 0, state: "queued", speed: 0, dest: "내 파일" },
  { name: "인터뷰 질문지.docx", kind: "doc", size: 220_000, loaded: 0, state: "queued", speed: 0, dest: "내 파일" },
  { name: "예산 시뮬레이션.xlsx", kind: "sheet", size: 1.8 * MB, loaded: 0, state: "queued", speed: 0, dest: "내 파일" },
]

const FOLDER_BATCH: Omit<Upload, "id"> = {
  name: "2026 워크숍 영상",
  kind: "folder",
  size: 1.4 * 1024 * MB,
  loaded: 0,
  state: "queued",
  speed: 0,
  dest: "내 파일",
  files: 23,
}

const CONCURRENCY = 3
const TICK = 300

/** 가짜 업로드 큐. setInterval 로 진행률을 흉내 낸다 */
export function useUploads() {
  const [items, setItems] = useState<Upload[]>(SEED)
  const seq = useRef(100)

  useEffect(() => {
    const id = setInterval(() => {
      setItems((list) => {
        let active = list.filter((u) => u.state === "uploading").length
        return list.map((u) => {
          if (u.state === "queued" && active < CONCURRENCY) {
            active++
            return { ...u, state: "uploading", speed: baseSpeed(u) }
          }
          if (u.state !== "uploading") return u
          const speed = Math.max(MB, u.speed * (0.85 + Math.random() * 0.3))
          const loaded = Math.min(u.size, u.loaded + speed * (TICK / 1000))
          if (loaded >= u.size) return { ...u, loaded, state: "done", speed: 0 }
          return { ...u, loaded, speed }
        })
      })
    }, TICK)
    return () => clearInterval(id)
  }, [])

  const add = useCallback((batch: Omit<Upload, "id">[]) => {
    setItems((list) => [...batch.map((b) => ({ ...b, id: `n${seq.current++}` })), ...list])
  }, [])

  return {
    items,
    addFiles: () => add(DROP_BATCH),
    addFolder: () => add([FOLDER_BATCH]),
    cancel: (id: string) => setItems((l) => l.map((u) => (u.id === id && u.state !== "done" ? { ...u, state: "canceled", speed: 0 } : u))),
    retry: (id: string) =>
      setItems((l) => l.map((u) => (u.id === id ? { ...u, state: "queued", loaded: 0, error: undefined } : u))),
    retryAll: () =>
      setItems((l) => l.map((u) => (u.state === "failed" ? { ...u, state: "queued", loaded: 0, error: undefined } : u))),
    cancelAll: () =>
      setItems((l) =>
        l.map((u) => (u.state === "uploading" || u.state === "queued" ? { ...u, state: "canceled", speed: 0 } : u)),
      ),
    remove: (id: string) => setItems((l) => l.filter((u) => u.id !== id)),
    clearFinished: () => setItems((l) => l.filter((u) => u.state !== "done" && u.state !== "canceled")),
    reset: () => setItems(SEED),
  }
}

function baseSpeed(u: Upload) {
  if (u.size < MB) return MB
  return Math.min(24 * MB, Math.max(4 * MB, u.size / 20))
}

export function summarize(items: Upload[]) {
  const live = items.filter((u) => u.state !== "canceled")
  const total = live.reduce((s, u) => s + u.size, 0)
  const loaded = live.reduce((s, u) => s + u.loaded, 0)
  const speed = items.reduce((s, u) => s + (u.state === "uploading" ? u.speed : 0), 0)
  const pending = live.filter((u) => u.state === "uploading" || u.state === "queued")
  const remaining = pending.reduce((s, u) => s + (u.size - u.loaded), 0)
  return {
    total,
    loaded,
    pct: total ? Math.round((loaded / total) * 100) : 0,
    speed,
    eta: speed > 0 ? remaining / speed : 0,
    active: pending.length,
    done: items.filter((u) => u.state === "done").length,
    failed: items.filter((u) => u.state === "failed").length,
    canceled: items.filter((u) => u.state === "canceled").length,
    count: live.length,
  }
}

export function pctOf(u: Upload) {
  return u.size ? Math.round((u.loaded / u.size) * 100) : 0
}

export function formatEta(sec: number): string {
  if (sec <= 0) return ""
  if (sec < 60) return `${Math.ceil(sec)}초 남음`
  if (sec < 3600) return `${Math.ceil(sec / 60)}분 남음`
  return `${Math.floor(sec / 3600)}시간 ${Math.ceil((sec % 3600) / 60)}분 남음`
}

export const speedOf = (bps: number) => `${formatBytes(bps)}/s`

/** 폴더 업로드의 완료된 하위 파일 수 */
export function filesDone(u: Upload) {
  if (!u.files) return 0
  return u.state === "done" ? u.files : Math.floor((u.loaded / u.size) * u.files)
}

/** 실제 드래그 이벤트 + 스크린샷용 강제 토글 */
export function useDragState(onDrop: () => void) {
  const [forced, setForced] = useState(false)
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  const handlers = {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault()
      depth.current += 1
      setOver(true)
    },
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDragLeave: () => {
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setOver(false)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      depth.current = 0
      setOver(false)
      onDrop()
    },
  }
  return {
    dragging: forced || over,
    forced,
    toggle: () => setForced((v) => !v),
    /** 강제 토글 상태에서 놓기 흉내 */
    drop: () => {
      setForced(false)
      onDrop()
    },
    handlers,
  }
}

/** 원형 진행 링 */
export function Ring({ pct, size = 28, stroke = 2.5, className }: { pct: number; size?: number; stroke?: number; className?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className={cn("-rotate-90", className)} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        className="stroke-primary transition-[stroke-dashoffset] duration-300"
      />
    </svg>
  )
}

export function Bar({ pct, tone = "primary", className }: { pct: number; tone?: "primary" | "rose" | "emerald"; className?: string }) {
  return (
    <div className={cn("h-1 overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300",
          tone === "primary" && "bg-primary",
          tone === "rose" && "bg-rose-500 dark:bg-rose-400",
          tone === "emerald" && "bg-emerald-500 dark:bg-emerald-400",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
