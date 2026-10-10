"use client"

import { useEffect, useRef, useState } from "react"
import {
  Download,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Loader2,
  Presentation,
  type LucideIcon,
} from "lucide-react"

import { api } from "@/lib/api-client"
import * as e2e from "@/lib/e2e/session"
import { cn } from "@/lib/utils"
import { formatBytes } from "@/lib/utils/format"
import { logger } from "@/lib/utils/logger"

/**
 * 파일 미리보기와 버전 기록 모달이 같이 쓰는 렌더링 도우미.
 *
 * 종류 판별은 mime 이 우선, 없으면 확장자 (보안 폴더 파일은 mime 이 null 이고 이름도 복호화한 뒤에 안다).
 */

export type FileKind =
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

/** 브라우저에서 바로 그릴 수 있는 방식 */
export type RenderMode = "image" | "pdf" | "video" | "audio" | "text" | "none"

export const KIND_META: Record<FileKind, { icon: LucideIcon; label: string; tone: string }> = {
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
  other: { icon: File, label: "파일", tone: "text-muted-foreground" },
}

const EXT_KIND: Record<string, FileKind> = {}
function reg(kind: FileKind, exts: string) {
  for (const e of exts.split(" ")) EXT_KIND[e] = kind
}
reg("image", "png jpg jpeg gif webp svg avif bmp ico heic heif tif tiff psd")
reg("pdf", "pdf")
reg("doc", "doc docx hwp hwpx odt rtf pages")
reg("sheet", "xls xlsx ods numbers csv tsv")
reg("slide", "ppt pptx odp key")
reg("video", "mp4 m4v webm mov mkv avi ogv")
reg("audio", "mp3 m4a wav ogg oga flac aac opus weba")
reg("archive", "zip tar gz tgz bz2 xz 7z rar")
reg(
  "code",
  "js mjs cjs ts tsx jsx py sh bash zsh go rs java kt swift c h cc cpp hpp cs rb php sql yaml yml toml json xml html htm css scss vue ini conf env dockerfile makefile",
)
reg("text", "txt md markdown log rst")

/** 브라우저가 직접 그리는 확장자 (heic/tiff/psd, mkv/avi 같은 건 대부분 못 그린다) */
const RENDER_EXT: Record<string, Exclude<RenderMode, "text" | "none">> = {}
for (const e of "png jpg jpeg gif webp svg avif bmp ico".split(" ")) RENDER_EXT[e] = "image"
RENDER_EXT.pdf = "pdf"
for (const e of "mp4 m4v webm mov ogv".split(" ")) RENDER_EXT[e] = "video"
for (const e of "mp3 m4a wav ogg oga flac aac opus weba".split(" ")) RENDER_EXT[e] = "audio"

const TEXT_MIMES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-sh",
  "application/x-yaml",
  "application/yaml",
  "application/sql",
  "application/toml",
])

/** 보안 폴더 복호화 결과를 Blob 으로 만들 때 쓰는 mime */
const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  pdf: "application/pdf",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  ogv: "video/ogg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  opus: "audio/ogg",
  weba: "audio/webm",
}

export function extOf(name: string): string {
  const base = name.toLowerCase()
  const i = base.lastIndexOf(".")
  if (i < 0) return base === "dockerfile" || base === "makefile" ? base : ""
  return base.slice(i + 1)
}

export function fileKindOf(mime: string | null, name: string): FileKind {
  const byExt = EXT_KIND[extOf(name)]
  if (mime) {
    if (mime.startsWith("image/")) return "image"
    if (mime === "application/pdf") return "pdf"
    if (mime.startsWith("video/")) return "video"
    if (mime.startsWith("audio/")) return "audio"
    if (byExt) return byExt
    if (mime.startsWith("text/") || TEXT_MIMES.has(mime)) return "text"
    if (/zip|tar|compressed|7z|rar/.test(mime)) return "archive"
    if (/spreadsheet|excel/.test(mime)) return "sheet"
    if (/presentation|powerpoint/.test(mime)) return "slide"
    if (/word|opendocument\.text|hwp/.test(mime)) return "doc"
  }
  return byExt ?? "other"
}

export function renderModeOf(mime: string | null, name: string): RenderMode {
  const ext = extOf(name)
  if (mime) {
    if (mime === "application/pdf") return "pdf"
    if (/^image\/(png|jpeg|gif|webp|svg\+xml|avif|bmp|x-icon|vnd\.microsoft\.icon)$/.test(mime)) return "image"
    if (/^video\/(mp4|webm|ogg|quicktime)$/.test(mime)) return "video"
    if (mime.startsWith("audio/")) return RENDER_EXT[ext] === "audio" || !ext ? "audio" : "none"
    if (mime.startsWith("text/") || TEXT_MIMES.has(mime)) return "text"
  }
  if (RENDER_EXT[ext]) return RENDER_EXT[ext]
  const kind = EXT_KIND[ext]
  if (kind === "code" || kind === "text" || ext === "csv" || ext === "tsv") return "text"
  return "none"
}

export function KindIcon({ kind, className }: { kind: FileKind; className?: string }) {
  const { icon: Icon, tone } = KIND_META[kind]
  return <Icon className={cn("size-4 shrink-0", tone, className)} />
}

const AVATAR_TONES = [
  "bg-violet-600 dark:bg-violet-500",
  "bg-sky-600 dark:bg-sky-500",
  "bg-emerald-600 dark:bg-emerald-500",
  "bg-amber-600 dark:bg-amber-500",
  "bg-rose-600 dark:bg-rose-500",
  "bg-teal-600 dark:bg-teal-500",
  "bg-indigo-600 dark:bg-indigo-500",
  "bg-orange-600 dark:bg-orange-500",
]

export function Avatar({
  id,
  name,
  size = 24,
  className,
}: {
  id: string
  name: string
  size?: number
  className?: string
}) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold text-white",
        AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length],
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      title={name}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  )
}

// --- 날짜 ---

function localDay(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** 그룹 머리: 오늘 / 어제 / 10월 7일 (화) */
export function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (localDay(d) === localDay(today)) return "오늘"
  if (localDay(d) === localDay(yesterday)) return "어제"
  return d.toLocaleDateString("ko-KR", {
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  })
}

export function dayKey(iso: string): string {
  return localDay(new Date(iso))
}

/** 오전 11:10 */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })
}

/** 10월 10일 오전 11:10 */
export function formatShortDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("ko-KR", {
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** 3분 전, 2시간 전, 어제, 10월 7일 */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "방금"
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24 && dayLabel(iso) === "오늘") return `${hr}시간 전`
  const label = dayLabel(iso)
  return label === "어제" ? `어제 ${formatTime(iso)}` : formatShortDateTime(iso)
}

export function Delta({ n, className }: { n: number | null; className?: string }) {
  if (n === null) return <span className={cn("text-[11px] text-muted-foreground", className)}>최초</span>
  const sign = n > 0 ? "+" : n < 0 ? "-" : "±"
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
      {sign}
      {formatBytes(Math.abs(n))}
    </span>
  )
}

/**
 * 키 입력을 이 창이 받아도 되는지: 입력 중이 아니고, 다른 모달(공유, 잠금해제, 확인창)이
 * 위에 떠 있지 않을 때만. 화면 가운데 맨 위 요소가 이 창 안인지로 판단한다.
 */
export function ownsKeyboard(root: HTMLElement | null, e: KeyboardEvent): boolean {
  if (e.defaultPrevented || !root) return false
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable))
    return false
  if (t && t !== document.body && !root.contains(t)) return false
  const top = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
  return !top || root.contains(top)
}

// --- 내용 불러오기 ---

/** presigned URL 응답: 버전 응답은 wrapped_dek 를 같이 준다 */
interface SourceResponse {
  url: string
  wrapped_dek?: string | null
}

/** 텍스트는 이 크기까지만 불러와서 보인다 */
const TEXT_MAX_BYTES = 5 * 1024 * 1024
const TEXT_MAX_CHARS = 200_000
/** 보안 폴더 파일은 통째로 받아 복호화해야 하므로 너무 크면 미리보지 않는다 */
const VAULT_MAX_BYTES = 200 * 1024 * 1024

export function canLoadPreview(mode: RenderMode, size: number | null, inVault: boolean): boolean {
  if (mode === "none") return false
  if (mode === "text" && (size ?? 0) > TEXT_MAX_BYTES) return false
  if (inVault && (size ?? 0) > VAULT_MAX_BYTES) return false
  return true
}

export interface PreviewSource {
  /** POST 로 presigned URL 을 받는 API 경로 */
  path: string
  /** 응답에 wrapped_dek 가 없을 때 쓰는 값 (노드 자체의 wrapped_dek) */
  wrappedDek?: string | null
  vaultRootId: string | null
  ensureUnlocked?: () => Promise<void>
}

async function decryptFrom(src: PreviewSource, res: SourceResponse, dek: string): Promise<Uint8Array> {
  await src.ensureUnlocked?.()
  // 보안 폴더: 암호문을 받아 브라우저에서 복호화 (S3 presigned 직접 호출이라 fetch).
  const resp = await fetch(res.url)
  if (!resp.ok) throw new Error(`다운로드 ${resp.status}`)
  return e2e.decryptDownload(src.vaultRootId!, dek, await resp.arrayBuffer())
}

export interface LoadedContent {
  /** img/iframe/video/audio 에 넣는 주소 (presigned 또는 복호화한 blob) */
  src: string | null
  text: string | null
  error: string | null
  loading: boolean
}

/**
 * 미리보기 내용 불러오기. presigned URL 은 열 때마다 새로 발급(짧은 TTL).
 * 보안 폴더 파일은 복호화해서 blob URL 로, 닫히거나 바뀌면 revoke.
 */
export function usePreviewContent(
  src: PreviewSource,
  mode: RenderMode,
  name: string,
  enabled: boolean,
  reloadKey = 0,
): LoadedContent {
  const [state, setState] = useState<LoadedContent>({ src: null, text: null, error: null, loading: false })
  const latest = useRef(src)
  useEffect(() => {
    latest.current = src
  })

  const { path, wrappedDek, vaultRootId } = src
  useEffect(() => {
    if (!enabled) {
      setState({ src: null, text: null, error: null, loading: false })
      return
    }
    let aborted = false
    let blobUrl: string | null = null
    setState({ src: null, text: null, error: null, loading: true })
    void (async () => {
      try {
        const res = await api<SourceResponse>(path, { method: "POST" })
        if (aborted) return
        const dek = res.wrapped_dek ?? wrappedDek ?? null
        if (vaultRootId && dek) {
          const plain = await decryptFrom(latest.current, res, dek)
          if (aborted) return
          if (mode === "text") {
            const text = new TextDecoder().decode(plain).slice(0, TEXT_MAX_CHARS)
            setState({ src: null, text, error: null, loading: false })
          } else {
            const type = EXT_MIME[extOf(name)] ?? ""
            blobUrl = URL.createObjectURL(new Blob([plain as unknown as BlobPart], { type }))
            setState({ src: blobUrl, text: null, error: null, loading: false })
          }
          return
        }
        if (mode === "text") {
          // presigned S3 URL 직접 호출 (BFF 밖): referrer 를 보내지 않는다.
          const r = await fetch(res.url, { referrerPolicy: "no-referrer" })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const body = await r.text()
          if (!aborted) setState({ src: null, text: body.slice(0, TEXT_MAX_CHARS), error: null, loading: false })
          return
        }
        setState({ src: res.url, text: null, error: null, loading: false })
      } catch (e) {
        logger.warn("preview_load_failed", { category: "ui", path, error: (e as Error).message })
        if (!aborted) setState({ src: null, text: null, error: (e as Error).message, loading: false })
      }
    })()
    return () => {
      aborted = true
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [path, wrappedDek, vaultRootId, mode, name, enabled, reloadKey])

  return state
}

/** 원본 내려받기: 보안 폴더면 복호화해서 평문 파일로 저장 */
export async function downloadSource(src: PreviewSource, name: string): Promise<void> {
  const res = await api<SourceResponse>(src.path, { method: "POST" })
  const dek = res.wrapped_dek ?? src.wrappedDek ?? null
  if (src.vaultRootId && dek) {
    const plain = await decryptFrom(src, res, dek)
    const href = URL.createObjectURL(new Blob([plain as unknown as BlobPart]))
    const a = document.createElement("a")
    a.href = href
    a.download = name
    a.click()
    URL.revokeObjectURL(href)
    return
  }
  window.open(res.url, "_blank", "noopener")
}

// --- 그리기 ---

const CODE_COMMENT = /^\s*(#|\/\/|--|;)/

function TextView({ text, numbered, testid }: { text: string; numbered: boolean; testid: string }) {
  const lines = text.split("\n")
  return (
    <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-md bg-card shadow-lg ring-1 ring-foreground/10">
      <pre data-testid={testid} className="m-0 overflow-x-auto py-3 font-mono text-xs leading-5 text-foreground">
        {lines.map((l, i) => (
          <div key={i} className="flex">
            {numbered && (
              <span className="w-12 shrink-0 select-none pr-3 text-right text-muted-foreground/60 tabular-nums">
                {i + 1}
              </span>
            )}
            <span
              className={cn(
                "whitespace-pre-wrap break-all pr-4",
                !numbered && "pl-4",
                numbered && CODE_COMMENT.test(l) && "text-muted-foreground",
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

export function FallbackCard({
  kind,
  name,
  size,
  note,
  onDownload,
  testid,
}: {
  kind: FileKind
  name: string
  size: number | null
  note?: string
  onDownload?: () => void
  testid: string
}) {
  return (
    <div className="m-auto w-full max-w-md rounded-xl bg-card p-6 shadow-lg ring-1 ring-foreground/10" data-testid={testid}>
      <div className="flex items-center gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted">
          <KindIcon kind={kind} className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground" title={name}>
            {name}
          </p>
          <p className="text-xs text-muted-foreground">
            {note ?? "미리보기 없음"}
            {size != null && `, ${formatBytes(size)}`}
          </p>
        </div>
      </div>
      {onDownload && (
        <button
          type="button"
          onClick={onDownload}
          data-testid={`${testid}-download`}
          className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-muted"
        >
          <Download className="size-3.5" />
          다운로드
        </button>
      )}
    </div>
  )
}

export const ZOOMS = [50, 75, 100, 125, 150, 200, 300]
export const ZOOM_FIT = 2

/**
 * 미리보기 본문. 부모는 크기가 정해진 `relative` 상자: 이 컴포넌트가 `absolute inset-0` 으로 채운다.
 * zoom 은 이미지에만 쓴다 (100 = 창에 맞춤).
 */
export function PreviewContent({
  mode,
  kind,
  name,
  size,
  content,
  enabled,
  zoom = 100,
  compact = false,
  testid,
  onDownload,
}: {
  mode: RenderMode
  kind: FileKind
  name: string
  size: number | null
  content: LoadedContent
  /** false 면 불러오지 않고 안내 카드 (지원 안 함, 너무 큼) */
  enabled: boolean
  zoom?: number
  compact?: boolean
  testid: string
  onDownload?: () => void
}) {
  const pad = compact ? "p-5" : "p-8"
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 확대/축소할 때 가운데를 유지
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2
  }, [zoom])

  let body: React.ReactNode
  if (!enabled) {
    body = (
      <div className={cn("flex min-h-full", pad)}>
        <FallbackCard
          kind={kind}
          name={name}
          size={size}
          note={mode === "none" ? undefined : "미리보기에 너무 큰 파일"}
          onDownload={onDownload}
          testid={`${testid}-fallback`}
        />
      </div>
    )
  } else if (content.error) {
    body = (
      <div className={cn("flex min-h-full", pad)}>
        <div className="m-auto max-w-md text-center">
          <p className="text-sm text-rose-600 dark:text-rose-400" data-testid={`${testid}-error`}>
            미리보기를 불러올 수 없습니다: {content.error}
          </p>
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              data-testid={`${testid}-error-download`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            >
              <Download className="size-3.5" />
              다운로드
            </button>
          )}
        </div>
      </div>
    )
  } else if (content.loading || (!content.src && content.text === null)) {
    body = (
      <div className="flex h-full items-center justify-center text-muted-foreground" data-testid={`${testid}-loading`}>
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  } else if (mode === "image" && content.src) {
    const zoomed = zoom !== 100 && fit
    body = (
      <div className={cn("flex min-h-full min-w-full", zoomed ? "w-max" : "h-full", pad)}>
        {/* next/image 는 presigned URL 짧은 만료 + 외부 도메인과 안 맞음 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={content.src}
          alt={name}
          referrerPolicy="no-referrer"
          data-testid={`${testid}-image`}
          onLoad={(e) => {
            const el = e.currentTarget
            setFit({ w: el.clientWidth, h: el.clientHeight })
          }}
          className={cn(
            "m-auto rounded-sm object-contain shadow-2xl ring-1 ring-foreground/10",
            !zoomed && "max-h-full max-w-full",
          )}
          style={zoomed ? { width: (fit.w * zoom) / 100, height: (fit.h * zoom) / 100, maxWidth: "none" } : undefined}
        />
      </div>
    )
  } else if (mode === "pdf" && content.src) {
    body = (
      <iframe
        src={content.src}
        referrerPolicy="no-referrer"
        data-testid={`${testid}-pdf`}
        className="h-full w-full border-0 bg-card"
        title={name}
      />
    )
  } else if (mode === "video" && content.src) {
    body = (
      <div className={cn("flex h-full", pad)}>
        <video
          src={content.src}
          controls
          data-testid={`${testid}-video`}
          className="m-auto max-h-full max-w-full rounded-md bg-black shadow-2xl ring-1 ring-foreground/10"
        />
      </div>
    )
  } else if (mode === "audio" && content.src) {
    body = (
      <div className={cn("flex min-h-full", pad)}>
        <div className="m-auto w-full max-w-xl rounded-xl bg-card p-6 shadow-lg ring-1 ring-foreground/10">
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-full bg-teal-50 dark:bg-teal-950/50">
              <KindIcon kind="audio" className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{name}</p>
              {size != null && <p className="text-xs text-muted-foreground tabular-nums">{formatBytes(size)}</p>}
            </div>
          </div>
          <audio src={content.src} controls data-testid={`${testid}-audio`} className="mt-5 w-full" />
        </div>
      </div>
    )
  } else if (mode === "text" && content.text !== null) {
    body = (
      <div className={cn("min-h-full", compact ? "p-4" : "p-6")}>
        <TextView text={content.text} numbered={kind === "code"} testid={`${testid}-text`} />
      </div>
    )
  } else {
    body = (
      <div className={cn("flex min-h-full", pad)}>
        <FallbackCard kind={kind} name={name} size={size} onDownload={onDownload} testid={`${testid}-fallback`} />
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="absolute inset-0 overflow-auto">
      {body}
    </div>
  )
}
