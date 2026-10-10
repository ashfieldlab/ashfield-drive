"use client"

/**
 * 파일 종류 판별(확장자와 mime), 종류별 아이콘과 색, 상대 시각, 표시 크기.
 * 목록, 갤러리, 업로드 행, 휴지통이 같이 쓴다.
 */

import {
  FileArchive,
  FileAudio,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  File as FileIcon,
  Folder,
  FolderLock,
  Image as ImageIcon,
  Presentation,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { NodeResponse } from "@/lib/types/api"

export type FileKind =
  | "folder"
  | "image"
  | "pdf"
  | "doc"
  | "sheet"
  | "slide"
  | "video"
  | "audio"
  | "archive"
  | "code"
  | "text"
  | "other"

const EXT: Record<string, FileKind> = {}
function reg(kind: FileKind, exts: string) {
  for (const e of exts.split(" ")) EXT[e] = kind
}
reg("image", "png jpg jpeg gif webp svg bmp tiff tif heic heif avif ico ai psd")
reg("pdf", "pdf")
reg("doc", "doc docx docm dot dotx dotm odt ott rtf html htm mht epub fb2 xps oxps djvu hwp hwpx pages fig")
reg("sheet", "xls xlsx xlsm xlt xltx xltm ods ots csv tsv numbers")
reg("slide", "ppt pptx pptm pot potx potm pps ppsx ppsm odp otp key")
reg("video", "mp4 mov m4v avi mkv webm wmv flv mpg mpeg 3gp")
reg("audio", "mp3 m4a wav flac aac ogg oga opus wma aiff")
reg("archive", "zip rar 7z tar gz tgz bz2 xz zst dmg iso")
reg("code", "js jsx ts tsx py rb go rs java kt c h cpp hpp cs php swift sh bash zsh ps1 sql json yaml yml toml xml css scss vue svelte")
reg("text", "txt md markdown log ini cfg conf")

export function extOf(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase()
}

/** 이름(확장자) 우선, 모르면 mime 으로 */
export function kindOf(name: string, mime: string | null, isFolder = false): FileKind {
  if (isFolder) return "folder"
  const byExt = EXT[extOf(name)]
  if (byExt) return byExt
  if (mime) {
    if (mime.startsWith("image/")) return "image"
    if (mime.startsWith("video/")) return "video"
    if (mime.startsWith("audio/")) return "audio"
    if (mime === "application/pdf") return "pdf"
    if (mime.startsWith("text/")) return "text"
  }
  return "other"
}

export const KIND: Record<FileKind, { icon: LucideIcon; label: string; fg: string; bg: string }> = {
  folder: { icon: Folder, label: "폴더", fg: "text-sky-600 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-950/50" },
  image: { icon: ImageIcon, label: "이미지", fg: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/50" },
  pdf: { icon: FileText, label: "PDF", fg: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-950/50" },
  doc: { icon: FileText, label: "문서", fg: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/50" },
  sheet: { icon: FileSpreadsheet, label: "스프레드시트", fg: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/50" },
  slide: { icon: Presentation, label: "프레젠테이션", fg: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/50" },
  video: { icon: FileVideo, label: "동영상", fg: "text-pink-600 dark:text-pink-400", bg: "bg-pink-50 dark:bg-pink-950/50" },
  audio: { icon: FileAudio, label: "오디오", fg: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-950/50" },
  archive: { icon: FileArchive, label: "압축 파일", fg: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/50" },
  code: { icon: FileCode, label: "코드", fg: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-950/50" },
  text: { icon: FileType, label: "텍스트", fg: "text-muted-foreground", bg: "bg-muted" },
  other: { icon: FileIcon, label: "파일", fg: "text-muted-foreground", bg: "bg-muted" },
}

/** 종류 필터 탭 */
export type TypeFilter = "all" | "folder" | "doc" | "image" | "media"
export const FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "folder", label: "폴더" },
  { key: "doc", label: "문서" },
  { key: "image", label: "이미지" },
  { key: "media", label: "미디어" },
]
const FILTER_KINDS: Record<Exclude<TypeFilter, "all">, FileKind[]> = {
  folder: ["folder"],
  doc: ["doc", "pdf", "sheet", "slide", "text", "code"],
  image: ["image"],
  media: ["video", "audio"],
}
export function matchesFilter(kind: FileKind, f: TypeFilter): boolean {
  return f === "all" || FILTER_KINDS[f].includes(kind)
}

export function KindIcon({
  kind,
  vault,
  className,
  strokeWidth,
}: {
  kind: FileKind
  vault?: boolean
  className?: string
  strokeWidth?: number
}) {
  const Icon = kind === "folder" && vault ? FolderLock : KIND[kind].icon
  return <Icon className={className} strokeWidth={strokeWidth} />
}

/** 색 배경 위 종류 아이콘 (목록 행) */
export function FileGlyph({ kind, vault, className }: { kind: FileKind; vault?: boolean; className?: string }) {
  const meta = KIND[kind]
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md",
        vault && kind === "folder"
          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
          : [meta.bg, meta.fg],
        className,
      )}
    >
      <KindIcon kind={kind} vault={vault} className="size-4" />
    </span>
  )
}

/** "방금", "3시간 전", "어제", "10월 3일" (올해가 아니면 연도 포함) */
export function relativeTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime()
  const diff = (now - t) / 1000
  if (diff < 60) return "방금"
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 172800) return "어제"
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`
  const d = new Date(t)
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return d.toLocaleDateString("ko-KR", sameYear ? { month: "long", day: "numeric" } : { year: "numeric", month: "long", day: "numeric" })
}

/** 암호화 파일(wrapped_dek)은 평문 크기 = 저장 크기 - 28 (iv 12 + tag 16) */
export function plainSize(n: NodeResponse): number | null {
  if (n.size_bytes == null) return null
  return n.wrapped_dek ? Math.max(0, n.size_bytes - 28) : n.size_bytes
}
