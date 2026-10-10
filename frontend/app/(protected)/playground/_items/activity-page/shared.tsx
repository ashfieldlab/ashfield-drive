"use client"

import type { ReactNode } from "react"
import {
  Archive,
  File,
  FileCode,
  FileImage,
  FileMusic,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  History,
  Link2,
  MoveRight,
  PencilLine,
  Plus,
  Presentation,
  RotateCcw,
  Trash2,
  Upload,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

import {
  ACTIVITY,
  NODES,
  type ActivityAction,
  type MockActivity,
  type MockKind,
  type MockMember,
} from "../_mock"

// 모든 시각은 목업 기준 "지금" 에 맞춘다.
export const NOW = new Date("2026-10-10T17:00:00+09:00")

export const SORTED: MockActivity[] = [...ACTIVITY].sort(
  (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
)

export const ACTION_META: Record<
  ActivityAction,
  { label: string; icon: LucideIcon; tone: string; dot: string }
> = {
  create: { label: "생성", icon: Plus, tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300", dot: "bg-emerald-500" },
  upload: { label: "업로드", icon: Upload, tone: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300", dot: "bg-sky-500" },
  rename: { label: "이름 변경", icon: PencilLine, tone: "bg-muted text-foreground/80", dot: "bg-muted-foreground" },
  move: { label: "이동", icon: MoveRight, tone: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300", dot: "bg-indigo-500" },
  delete: { label: "삭제", icon: Trash2, tone: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300", dot: "bg-rose-500" },
  restore: { label: "복원", icon: RotateCcw, tone: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300", dot: "bg-amber-500" },
  share: { label: "공유", icon: UserPlus, tone: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300", dot: "bg-violet-500" },
  unshare: { label: "공유 해제", icon: UserMinus, tone: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60" },
  link: { label: "링크 생성", icon: Link2, tone: "bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300", dot: "bg-teal-500" },
  version: { label: "새 버전", icon: History, tone: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300", dot: "bg-blue-500" },
}

export const KIND_META: Record<MockKind, { icon: LucideIcon; tone: string }> = {
  folder: { icon: Folder, tone: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300" },
  image: { icon: FileImage, tone: "bg-pink-50 text-pink-600 dark:bg-pink-950/50 dark:text-pink-300" },
  pdf: { icon: FileText, tone: "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300" },
  doc: { icon: FileText, tone: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300" },
  sheet: { icon: FileSpreadsheet, tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300" },
  slide: { icon: Presentation, tone: "bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-300" },
  video: { icon: FileVideo, tone: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300" },
  audio: { icon: FileMusic, tone: "bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-300" },
  archive: { icon: Archive, tone: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300" },
  code: { icon: FileCode, tone: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300" },
  text: { icon: File, tone: "bg-muted text-muted-foreground" },
}

export function KindIcon({ kind, size = "md" }: { kind: MockKind; size?: "sm" | "md" | "lg" }) {
  const m = KIND_META[kind]
  const Icon = m.icon
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md",
        m.tone,
        size === "sm" && "size-5 [&_svg]:size-3",
        size === "md" && "size-7 [&_svg]:size-4",
        size === "lg" && "size-9 [&_svg]:size-[18px]",
      )}
    >
      <Icon />
    </span>
  )
}

export function Avatar({ m, size = 28, className }: { m: MockMember; size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white",
        className,
      )}
      style={{ background: m.color, width: size, height: size, fontSize: size * 0.4 }}
      title={m.name}
    >
      {m.name.slice(0, 1)}
    </span>
  )
}

export function thumbOf(name: string): string | undefined {
  return NODES.find((n) => n.name === name)?.thumb
}

/** 받침 여부. 영문은 철자 이름(엘, 엠, 엔, 알)으로 읽는다고 본다 */
function hasBatchim(word: string): { yes: boolean; rieul: boolean } {
  const c = word.trim().slice(-1)
  const code = c.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) {
    const j = (code - 0xac00) % 28
    return { yes: j !== 0, rieul: j === 8 }
  }
  if (/[0-9]/.test(c)) return { yes: "013678".includes(c), rieul: "178".includes(c) }
  const l = c.toLowerCase()
  return { yes: "lmnr".includes(l), rieul: "lr".includes(l) }
}

export const eul = (w: string) => (hasBatchim(w).yes ? "을" : "를")
export const ro = (w: string) => {
  const b = hasBatchim(w)
  return b.yes && !b.rieul ? "으로" : "로"
}
export const gwa = (w: string) => (hasBatchim(w).yes ? "과" : "와")

/** 동작별 문장. actor, target 은 렌더러가 꾸민다 */
export function sentence(
  a: MockActivity,
  r: { actor: (m: MockMember) => ReactNode; target: (name: string) => ReactNode; em?: (s: string) => ReactNode },
): ReactNode {
  const em = r.em ?? ((s: string) => <span className="font-medium text-foreground">{s}</span>)
  const who = <>{r.actor(a.actor)}님이 </>
  const t = r.target(a.target)
  switch (a.action) {
    case "create":
      return <>{who}{t}{eul(a.target)} 만들었습니다</>
    case "upload":
      return a.detail ? (
        <>{who}{em(a.detail)}에 {t}{eul(a.target)} 올렸습니다</>
      ) : (
        <>{who}{t}{eul(a.target)} 올렸습니다</>
      )
    case "rename":
      return <>{who}{a.detail ? <>{em(a.detail)}의 </> : null}이름을 {t}{ro(a.target)} 바꿨습니다</>
    case "move":
      return <>{who}{t}{eul(a.target)} {em(a.detail ?? "")}{ro(a.detail ?? "")} 옮겼습니다</>
    case "delete":
      return <>{who}{t}{eul(a.target)} 휴지통으로 옮겼습니다</>
    case "restore":
      return <>{who}{t}{eul(a.target)} 복원했습니다</>
    case "share": {
      const names = (a.detail ?? "").split(",").map((s) => s.trim()).filter(Boolean)
      const label = names.length > 1 ? `${names[0]}님 외 ${names.length - 1}명` : `${names[0]}님`
      return <>{who}{t}{eul(a.target)} {em(label)}{gwa(label)} 공유했습니다</>
    }
    case "unshare":
      return <>{who}{t}에서 {em(`${a.detail}님`)}의 접근을 해제했습니다</>
    case "link":
      return <>{who}{t}의 공유 링크를 만들었습니다</>
    case "version":
      return <>{who}{t}의 {a.detail ? em(a.detail) : "새 버전"}{a.detail ? eul(a.detail) : ""} 저장했습니다</>
  }
}

/** 오늘 / 어제 / 이번 주 / 이전 */
export function dayBucket(iso: string): string {
  const start = new Date(NOW)
  start.setHours(0, 0, 0, 0)
  const t = new Date(iso).getTime()
  const day = 86400_000
  if (t >= start.getTime()) return "오늘"
  if (t >= start.getTime() - day) return "어제"
  if (t >= start.getTime() - 6 * day) return "이번 주"
  return "이전"
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
}

export function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric", weekday: "short" })
}

export function daysAgo(iso: string): number {
  return (NOW.getTime() - new Date(iso).getTime()) / 86400_000
}

/** 짧은 한 줄: "디자인에 업로드", "김하늘님 외 2명과 공유" */
export function shortLine(a: MockActivity): string {
  const d = a.detail ?? ""
  switch (a.action) {
    case "create":
      return "생성"
    case "upload":
      return d ? `${d}에 업로드` : "업로드"
    case "rename":
      return d ? `${d}에서 이름 변경` : "이름 변경"
    case "move":
      return `${d}${ro(d)} 이동`
    case "delete":
      return "휴지통으로 이동"
    case "restore":
      return "휴지통에서 복원"
    case "share": {
      const names = d.split(",").map((s) => s.trim()).filter(Boolean)
      const label = names.length > 1 ? `${names[0]}님 외 ${names.length - 1}명` : `${names[0]}님`
      return `${label}${gwa(label)} 공유`
    }
    case "unshare":
      return `${d}님 접근 해제`
    case "link":
      return "공유 링크 생성"
    case "version":
      return `${d || "새 버전"} 저장`
  }
}
