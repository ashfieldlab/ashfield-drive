"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Download } from "lucide-react"

import { cn } from "@/lib/utils"

import { ME, NODES, VERSIONS, formatBytes, type MockMember, type MockNode, type MockVersion } from "../_mock"

export const FILE: MockNode = NODES.find((n) => n.id === "n-plan")!

export interface Version extends MockVersion {
  /** 버전 번호 (1부터) */
  no: number
  /** 다른 버전에서 복원해 생긴 버전이면 원본 번호 */
  restoredFrom?: number
}

const INITIAL: Version[] = VERSIONS.map((v, i) => ({ ...v, no: VERSIONS.length - i }))

/** 바로 이전 버전과 크기 차이 (첫 버전은 null) */
export function deltaOf(list: Version[], v: Version): number | null {
  const i = list.indexOf(v)
  const prev = list[i + 1]
  return prev ? v.size - prev.size : null
}

export function formatDelta(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "±"
  return `${sign}${formatBytes(Math.abs(n))}`
}

export function Delta({ n, className }: { n: number | null; className?: string }) {
  if (n === null)
    return <span className={cn("text-[11px] text-muted-foreground", className)}>최초</span>
  return (
    <span
      className={cn(
        "text-[11px] tabular-nums",
        n > 0
          ? "text-emerald-700 dark:text-emerald-400"
          : n < 0
            ? "text-rose-700 dark:text-rose-400"
            : "text-muted-foreground",
        className,
      )}
    >
      {formatDelta(n)}
    </span>
  )
}

const TZ = "Asia/Seoul"

/** 10월 10일 오전 11:10 */
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: TZ,
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** 오전 11:10 */
export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { timeZone: TZ, hour: "numeric", minute: "2-digit" })
}

/** 오늘 / 어제 / 10월 7일 (화) */
export function dayLabel(iso: string) {
  const day = new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ })
  if (day === "2026-10-10") return "오늘"
  if (day === "2026-10-09") return "어제"
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: TZ, month: "long", day: "numeric", weekday: "short" })
}

export function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ })
}

export function Avatar({ m, size = 24, className }: { m: MockMember; size?: number; className?: string }) {
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold text-white", className)}
      style={{ background: m.color, width: size, height: size, fontSize: Math.round(size * 0.42) }}
      title={m.name}
    >
      {m.name[0]}
    </span>
  )
}

export function memberLabel(m: MockMember) {
  return m.id === ME.id ? `${m.name} (나)` : m.name
}

/** 버전 목록 + 복원/다운로드 흉내 */
export function useVersions() {
  const [versions, setVersions] = useState<Version[]>(INITIAL)
  const [downloading, setDownloading] = useState<Record<string, number>>({})
  const [downloaded, setDownloaded] = useState<Set<string>>(() => new Set())
  const timers = useRef<number[]>([])

  useEffect(() => {
    const list = timers.current
    return () => list.forEach((t) => window.clearInterval(t))
  }, [])

  /** 복원: 고른 버전 내용으로 새 현재 버전을 만든다. 지금 버전은 기록에 남는다 */
  const restore = useCallback((id: string) => {
    setVersions((prev) => {
      const src = prev.find((v) => v.id === id)
      if (!src) return prev
      const no = Math.max(...prev.map((v) => v.no)) + 1
      const next: Version = {
        id: `v${no}`,
        no,
        size: src.size,
        savedBy: ME,
        savedAt: "2026-10-10T08:00:00.000Z",
        current: true,
        restoredFrom: src.no,
      }
      return [next, ...prev.map((v) => ({ ...v, current: false }))]
    })
  }, [])

  const download = useCallback((id: string) => {
    setDownloading((d) => ({ ...d, [id]: 0 }))
    const t = window.setInterval(() => {
      setDownloading((d) => {
        const p = (d[id] ?? 0) + 18
        if (p >= 100) {
          window.clearInterval(t)
          const rest = { ...d }
          delete rest[id]
          setDownloaded((s) => new Set(s).add(id))
          return rest
        }
        return { ...d, [id]: p }
      })
    }, 120)
    timers.current.push(t)
  }, [])

  return { versions, restore, download, downloading, downloaded }
}

export type VersionsApi = ReturnType<typeof useVersions>

export const RETENTION_DAYS = 30

/** 다운로드 아이콘: 진행 중이면 원형 진행, 끝나면 체크 */
export function DownloadGlyph({ progress, done, size = 15 }: { progress?: number; done?: boolean; size?: number }) {
  if (progress !== undefined) {
    const r = size / 2 - 1.5
    const c = 2 * Math.PI * r
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={2} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress / 100)}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-100"
        />
      </svg>
    )
  }
  if (done) return <Check size={size} className="text-emerald-600 dark:text-emerald-400" />
  return <Download size={size} />
}
