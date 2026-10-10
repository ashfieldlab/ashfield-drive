"use client"

/* eslint-disable @next/next/no-img-element -- presigned S3 URL 미리보기, next/image 최적화 대상 아님 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Check, ChevronRight, Clock, Download, Eye, Link2Off, Loader2, Lock, Mail } from "lucide-react"

import { KIND_META, KindIcon } from "@/components/activity/kind-icon"
import { UserAvatar } from "@/components/activity/user-avatar"
import { Button } from "@/components/ui/button"
import { AppIcon } from "@/components/ui-custom/app-icon"
import { cn } from "@/lib/utils"
import { fileKind } from "@/lib/utils/audit-format"
import { formatBytes } from "@/lib/utils/format"
import { logger } from "@/lib/utils/logger"

import {
  fetchZip,
  isUnlocked,
  listFolder,
  PublicLinkError,
  readWithProgress,
  requestDownloadUrl,
  unlockMeta,
  type ExpiredInfo,
  type PublicFolderItem,
  type PublicFolderListing,
  type PublicNodeMeta,
  type UnlockedMeta,
} from "./public-api"

// ---------------------------------------------------------------------------
// 공통 조각
// ---------------------------------------------------------------------------

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })
}

function daysLeft(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))
}

function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 text-sm font-semibold tracking-tight", className)}>
      <AppIcon alt="Ashfield" size={22} className="size-[22px] rounded-md" />
      Ashfield Drive
    </span>
  )
}

/** 왼쪽 브랜드 패널. 공유한 사람, 만료일은 백엔드가 알려 줄 때만 */
function SidePanel({
  title,
  sharerName,
  expiresAt,
  expired,
}: {
  title: string
  sharerName?: string | null
  expiresAt?: string | null
  expired?: boolean
}) {
  const rows: [string, React.ReactNode][] = []
  if (sharerName) {
    rows.push([
      "공유",
      <span key="s" className="flex items-center gap-2">
        <UserAvatar name={sharerName} seed={sharerName} size={20} className="ring-2 ring-primary-foreground/20" />
        {sharerName}
      </span>,
    ])
  }
  if (expiresAt) {
    rows.push(["만료", expired ? formatDay(expiresAt) : `${formatDay(expiresAt)}, ${daysLeft(expiresAt)}일 남음`])
  }
  return (
    <aside className="relative hidden w-[300px] shrink-0 flex-col overflow-hidden bg-primary p-7 text-primary-foreground md:flex">
      <div
        className="pointer-events-none absolute -right-24 -bottom-24 size-80 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, currentColor 0%, transparent 65%)" }}
      />
      <div className="pointer-events-none absolute top-1/3 -left-16 size-56 rounded-full border border-current opacity-10" />
      <Brand className="relative [&_img]:ring-1 [&_img]:ring-primary-foreground/20" />
      <div className="relative mt-auto">
        <p className="text-[11px] font-medium tracking-[0.18em] uppercase opacity-60">공유 링크</p>
        <p className="mt-2 text-2xl leading-snug font-semibold break-all" data-testid="external-link-title">
          {title}
        </p>
        {rows.length > 0 && (
          <dl className="mt-8 space-y-3 border-t border-primary-foreground/15 pt-5 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <dt className="opacity-60">{k}</dt>
                <dd className={cn("text-right font-medium", k === "만료" && expired && "line-through opacity-70")}>{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </aside>
  )
}

/** 패널이 숨는 좁은 화면용 상단 브랜드 줄 */
function MobileBar() {
  return (
    <div className="flex h-12 shrink-0 items-center border-b bg-primary px-4 text-primary-foreground md:hidden">
      <Brand />
    </div>
  )
}

export function PublicLinkFrame({
  panel,
  children,
  testid,
}: {
  panel: React.ComponentProps<typeof SidePanel>
  children: React.ReactNode
  testid?: string
}) {
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground md:flex-row" data-testid={testid}>
      <MobileBar />
      <SidePanel {...panel} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
    </div>
  )
}

function PaneHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3 sm:px-8">
      {children}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-8">{children}</div>
}

// ---------------------------------------------------------------------------
// 다운로드 (진행률)
// ---------------------------------------------------------------------------

// 이 크기 이하만 받아서 진행률 표시 (메모리에 담기 때문). 그보다 크면 브라우저 다운로드로 넘긴다.
const PROGRESS_LIMIT = 512 * 1024 * 1024

function saveBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
}

function errorText(err: unknown): string {
  if (err instanceof PublicLinkError) {
    if (err.status === 401) return "비밀번호가 올바르지 않습니다"
    if (err.status === 404) return "링크를 찾을 수 없습니다"
    if (err.status === 410) return "링크가 만료되었습니다"
    if (err.status === 413) return "용량이 커서 한 번에 받을 수 없습니다"
    if (err.status === 403) return "보안 폴더는 받을 수 없습니다"
  }
  return "다운로드하지 못했습니다"
}

/** 진행률 있는 전송 하나. run 이 onProgress 를 부르며 끝까지 받는다 */
function useTransfer() {
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current)
  }, [])

  async function start(run: (onProgress: (pct: number) => void) => Promise<void>) {
    if (progress !== null && progress < 100) return
    setError(null)
    setProgress(0)
    try {
      await run(setProgress)
      setProgress(100)
      resetTimer.current = setTimeout(() => setProgress(null), 1200)
    } catch (err) {
      setProgress(null)
      setError(errorText(err))
      logger.warn("public_link_download_failed", { category: "api", error: String(err) })
    }
  }
  return { progress, error, start }
}

/** 파일 하나 받기 (nodeId = 폴더 링크 안의 파일) */
async function downloadFile(
  token: string,
  password: string | null,
  file: { name: string; mime: string | null; size_bytes: number | null },
  onProgress: (pct: number) => void,
  nodeId?: string,
) {
  const url = await requestDownloadUrl(token, password, nodeId)
  if ((file.size_bytes ?? 0) > PROGRESS_LIMIT) {
    window.location.href = url
    return
  }
  // presigned S3 URL (외부 오리진) 직접 GET: 진행률을 위해 스트림으로 받는다.
  const r = await fetch(url, { referrerPolicy: "no-referrer" })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const blob = await readWithProgress(r, file.size_bytes ?? 0, onProgress, file.mime ?? "application/octet-stream")
  saveBlob(blob, file.name)
}

function DownloadButton({
  label,
  progress,
  onClick,
  testid = "external-link-download-button",
}: {
  label: string
  progress: number | null
  onClick: () => void
  testid?: string
}) {
  const busy = progress !== null
  return (
    <Button size="lg" onClick={onClick} disabled={busy} data-testid={testid} className="min-w-32 tabular-nums">
      {progress === 100 ? <Check /> : busy ? <Loader2 className="animate-spin" /> : <Download />}
      {progress === 100 ? "완료" : busy ? `${Math.floor(progress)}%` : label}
    </Button>
  )
}

function ErrorBar({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <p
      className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 sm:px-8 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
      role="alert"
      data-testid="external-link-error"
    >
      {text}
    </p>
  )
}

// ---------------------------------------------------------------------------
// 비밀번호
// ---------------------------------------------------------------------------

export function PasswordPane({
  token,
  onUnlock,
}: {
  token: string
  onUnlock: (password: string, meta: UnlockedMeta) => void
}) {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!value || busy) return
    setBusy(true)
    setError(null)
    try {
      const meta = await unlockMeta(token, value)
      if (!isUnlocked(meta)) throw new Error("incomplete meta")
      onUnlock(value, meta)
    } catch (err) {
      if (err instanceof PublicLinkError && err.status === 401) {
        setError("비밀번호가 올바르지 않습니다")
      } else {
        setError("확인하지 못했습니다")
        logger.warn("public_link_password_failed", { category: "api", error: String(err) })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Centered>
      <form
        className="w-full max-w-xs"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        data-testid="external-link-password-form"
      >
        <Lock className="size-5 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">비밀번호 입력</h1>
        <label className="mt-8 block text-xs font-medium text-muted-foreground" htmlFor="external-link-password">
          비밀번호
        </label>
        <input
          id="external-link-password"
          type="password"
          autoFocus
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          aria-invalid={!!error}
          data-testid="external-link-password-input"
          className={cn(
            "mt-1.5 h-10 w-full border-b-2 border-input bg-transparent text-base tracking-widest outline-none transition-colors focus:border-primary",
            error && "border-destructive focus:border-destructive",
          )}
        />
        <p
          className={cn("mt-1.5 h-4 text-xs text-destructive", !error && "invisible")}
          data-testid="external-link-password-error"
          role={error ? "alert" : undefined}
        >
          {error ?? " "}
        </p>
        <Button
          type="submit"
          size="lg"
          className="mt-6 w-full"
          disabled={!value || busy}
          data-testid="external-link-password-submit"
        >
          {busy && <Loader2 className="animate-spin" />}
          확인
        </Button>
      </form>
    </Centered>
  )
}

// ---------------------------------------------------------------------------
// 단일 파일
// ---------------------------------------------------------------------------

type PreviewKind = "image" | "video" | "audio" | "pdf" | "text" | null

function previewKind(meta: PublicNodeMeta): PreviewKind {
  const mime = meta.mime ?? ""
  const size = meta.size_bytes ?? 0
  if (mime.startsWith("image/")) return size <= 50 * 1024 * 1024 ? "image" : null
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("audio/")) return "audio"
  if (mime === "application/pdf") return size <= 50 * 1024 * 1024 ? "pdf" : null
  if (mime.startsWith("text/") || mime === "application/json") return size <= 1024 * 1024 ? "text" : null
  return null
}

function kindLabel(meta: UnlockedMeta): string {
  return KIND_META[fileKind(meta.name, meta.mime, meta.kind === "folder")].label
}

function FilePreviewBox({ kind, url, mime }: { kind: Exclude<PreviewKind, null>; url: string; mime: string | null }) {
  // pdf, text 는 첨부(attachment) 응답이라 바로 띄우면 내려받기가 된다: 받아서 blob 으로 띄운다.
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (kind !== "pdf" && kind !== "text") return
    let aborted = false
    let created: string | null = null
    // presigned S3 URL (외부 오리진) 직접 GET
    fetch(url, { referrerPolicy: "no-referrer" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        if (kind === "text") {
          const body = await r.text()
          if (!aborted) setText(body.slice(0, 200_000))
        } else {
          const buf = await r.arrayBuffer()
          created = URL.createObjectURL(new Blob([buf], { type: mime ?? "application/pdf" }))
          if (!aborted) setBlobUrl(created)
        }
      })
      .catch((err) => {
        logger.warn("public_link_preview_failed", { category: "api", error: String(err) })
        if (!aborted) setFailed(true)
      })
    return () => {
      aborted = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [kind, url, mime])

  if (failed) return null
  if (kind === "image") {
    return (
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        className="max-h-full max-w-full rounded-lg object-contain shadow-xl ring-1 ring-black/5"
        onError={() => setFailed(true)}
      />
    )
  }
  if (kind === "video") {
    return <video src={url} controls className="max-h-full max-w-full rounded-lg shadow-xl" data-testid="external-link-video" />
  }
  if (kind === "audio") {
    return <audio src={url} controls className="w-full max-w-md" data-testid="external-link-audio" />
  }
  if (kind === "pdf") {
    return blobUrl ? (
      <iframe src={blobUrl} title="PDF" className="h-full w-full max-w-4xl rounded-lg border bg-card shadow-xl" />
    ) : (
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    )
  }
  return text !== null ? (
    <pre className="h-full w-full max-w-4xl overflow-auto rounded-lg border bg-card p-6 font-mono text-xs leading-relaxed whitespace-pre-wrap shadow-xl">
      {text}
    </pre>
  ) : (
    <Loader2 className="size-6 animate-spin text-muted-foreground" />
  )
}

export function FilePane({
  token,
  meta,
  password,
}: {
  token: string
  meta: UnlockedMeta
  password: string | null
}) {
  const pk = previewKind(meta)
  const [showPreview, setShowPreview] = useState(pk !== null)
  const [url, setUrl] = useState<string | null>(null)
  const dl = useTransfer()
  const kind = fileKind(meta.name, meta.mime)

  const loadPreview = useCallback(async () => {
    try {
      setUrl(await requestDownloadUrl(token, password))
    } catch (err) {
      logger.warn("public_link_preview_url_failed", { category: "api", error: String(err) })
      setShowPreview(false)
    }
  }, [token, password])

  useEffect(() => {
    if (pk && showPreview && !url) void loadPreview()
  }, [pk, showPreview, url, loadPreview])

  return (
    <>
      <PaneHeader>
        <div className="flex min-w-0 items-center gap-3">
          <KindIcon kind={kind} className="size-9 rounded-lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" data-testid="external-link-name">
              {meta.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(meta.size_bytes)}, {kindLabel(meta)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pk && (
            <Button
              variant="outline"
              size="lg"
              onClick={() => setShowPreview((v) => !v)}
              aria-pressed={showPreview}
              data-testid="external-link-preview-toggle"
            >
              <Eye />
              미리보기
            </Button>
          )}
          <DownloadButton label="다운로드" progress={dl.progress} onClick={() => void dl.start((p) => downloadFile(token, password, meta, p))} />
        </div>
      </PaneHeader>
      <ErrorBar text={dl.error} />
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/40 p-6 sm:p-10">
        {pk && showPreview && url ? (
          <FilePreviewBox kind={pk} url={url} mime={meta.mime} />
        ) : pk && showPreview ? (
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        ) : (
          <KindIcon kind={kind} className="size-32 rounded-[2rem]" iconClassName="size-14" />
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// 폴더: 한 단계 목록 + 하위 폴더 탐색 + 모두 다운로드(ZIP)
// ---------------------------------------------------------------------------

function ItemDownload({
  token,
  password,
  item,
  onError,
}: {
  token: string
  password: string | null
  item: PublicFolderItem
  onError: (msg: string | null) => void
}) {
  const t = useTransfer()
  useEffect(() => onError(t.error), [t.error, onError])
  const busy = t.progress !== null
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={cn("opacity-0 group-hover:opacity-100 focus-visible:opacity-100", busy && "opacity-100")}
      data-testid={`external-link-item-download-${item.id}`}
      aria-label="다운로드"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation()
        void t.start((p) => downloadFile(token, password, item, p, item.id))
      }}
    >
      {t.progress === 100 ? <Check /> : busy ? <Loader2 className="animate-spin" /> : <Download />}
    </Button>
  )
}

export function FolderPane({
  token,
  meta,
  password,
}: {
  token: string
  meta: UnlockedMeta
  password: string | null
}) {
  const [folderId, setFolderId] = useState<string | null>(null)
  const [listing, setListing] = useState<PublicFolderListing | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [itemError, setItemError] = useState<string | null>(null)
  const zip = useTransfer()

  useEffect(() => {
    let cancelled = false
    listFolder(token, password, folderId)
      .then((l) => {
        if (!cancelled) {
          setListing(l)
          setLoadError(null)
        }
      })
      .catch((err) => {
        logger.warn("public_link_list_failed", { category: "api", error: String(err) })
        if (!cancelled) setLoadError(errorText(err) === "다운로드하지 못했습니다" ? "목록을 불러오지 못했습니다" : errorText(err))
      })
    return () => {
      cancelled = true
    }
  }, [token, password, folderId])

  const current = listing && (listing.folder_id === folderId || (folderId === null && listing.path.length === 1)) ? listing : null
  const items = current?.items ?? []
  const total = items.reduce((s, i) => s + (i.kind === "file" ? (i.size_bytes ?? 0) : 0), 0)
  const name = current?.name ?? meta.name

  return (
    <>
      <PaneHeader>
        <div className="flex min-w-0 items-center gap-3">
          <KindIcon kind="folder" className="size-9 rounded-lg" />
          <div className="min-w-0">
            {current && current.path.length > 1 ? (
              <nav className="flex min-w-0 items-center gap-1 text-sm" data-testid="external-link-breadcrumb">
                {current.path.map((c, i) => {
                  const last = i === current.path.length - 1
                  return (
                    <span key={c.id} className="flex min-w-0 items-center gap-1">
                      {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
                      {last ? (
                        <span className="truncate font-semibold" data-testid="external-link-name">
                          {c.name}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="truncate text-muted-foreground hover:text-foreground"
                          onClick={() => setFolderId(i === 0 ? null : c.id)}
                          data-testid={`external-link-crumb-${c.id}`}
                        >
                          {c.name}
                        </button>
                      )}
                    </span>
                  )
                })}
              </nav>
            ) : (
              <p className="truncate text-sm font-semibold" data-testid="external-link-name">
                {name}
              </p>
            )}
            <p className="text-xs text-muted-foreground tabular-nums">
              {current ? `${items.length}개, ${formatBytes(total)}` : "폴더"}
            </p>
          </div>
        </div>
        <DownloadButton
          label="모두 다운로드"
          testid="external-link-download-all"
          progress={zip.progress}
          onClick={() =>
            void zip.start(async (p) => {
              const blob = await fetchZip(token, password, folderId, p)
              saveBlob(blob, `${name}.zip`)
            })
          }
        />
      </PaneHeader>
      <ErrorBar text={zip.error ?? itemError ?? loadError} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!current && !loadError ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : current && items.length === 0 ? (
          <div className="flex h-full items-center justify-center bg-muted/40 p-10" data-testid="external-link-folder-empty">
            <KindIcon kind="folder" className="size-32 rounded-[2rem]" iconClassName="size-14" />
          </div>
        ) : current ? (
          <table className="w-full text-sm" data-testid="external-link-folder-table">
            <thead className="sticky top-0 bg-background/95 text-left text-xs text-muted-foreground backdrop-blur">
              <tr className="border-b">
                <th className="py-2 pl-4 font-medium sm:pl-8">이름</th>
                <th className="hidden w-28 py-2 font-medium sm:table-cell">종류</th>
                <th className="w-24 py-2 pr-4 text-right font-medium">크기</th>
                <th className="w-14 pr-4 sm:pr-6" />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const k = fileKind(it.name, it.mime, it.kind === "folder")
                const openable = it.kind === "folder" && it.available
                return (
                  <tr
                    key={it.id}
                    className={cn(
                      "group border-b border-border/60",
                      it.available ? "hover:bg-muted/50" : "text-muted-foreground",
                      openable && "cursor-pointer",
                    )}
                    data-testid={`external-link-row-${it.id}`}
                    onClick={openable ? () => setFolderId(it.id) : undefined}
                  >
                    <td className="py-2 pl-4 sm:pl-8">
                      <div className="flex min-w-0 items-center gap-3">
                        <KindIcon kind={k} className="size-8 rounded-md" />
                        {openable ? (
                          <button
                            type="button"
                            className="truncate text-left hover:underline"
                            data-testid={`external-link-open-${it.id}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setFolderId(it.id)
                            }}
                          >
                            {it.name}
                          </button>
                        ) : (
                          <span className="truncate">{it.name}</span>
                        )}
                        {!it.available && <Lock className="size-3.5 shrink-0" aria-label="보안 폴더" />}
                      </div>
                    </td>
                    <td className="hidden text-xs text-muted-foreground sm:table-cell">
                      {it.available ? KIND_META[k].label : "보안 폴더"}
                    </td>
                    <td className="pr-4 text-right text-xs tabular-nums text-muted-foreground">
                      {it.kind === "file" ? formatBytes(it.size_bytes) : ""}
                    </td>
                    <td className="pr-4 text-right sm:pr-6">
                      {it.kind === "file" && it.available && (
                        <ItemDownload token={token} password={password} item={it} onError={setItemError} />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : null}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// 만료, 없음
// ---------------------------------------------------------------------------

export function ExpiredPane({ info }: { info: ExpiredInfo }) {
  const name = info.sharer_name ?? null
  const email = info.sharer_email ?? null
  const card = name ? (
    <>
      <UserAvatar name={name} seed={name} size={32} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{name}</p>
        {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
      </div>
      {email && <Mail className="size-4 text-muted-foreground group-hover:text-foreground" />}
    </>
  ) : null
  return (
    <Centered>
      <div className="w-full max-w-xs" data-testid="external-link-expired">
        <Clock className="size-5 text-amber-600 dark:text-amber-300" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">만료된 링크</h1>
        <p className="mt-2 text-sm text-muted-foreground">링크가 만료되었습니다.</p>
        {card &&
          (email ? (
            <a
              href={`mailto:${email}`}
              data-testid="external-link-expired-contact"
              className="group mt-8 flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/50"
            >
              {card}
            </a>
          ) : (
            <div className="mt-8 flex items-center gap-3 rounded-xl border p-4">{card}</div>
          ))}
      </div>
    </Centered>
  )
}

export function NotFoundPane({ error }: { error?: boolean }) {
  return (
    <Centered>
      <div className="w-full max-w-xs" data-testid="external-link-not-found">
        <Link2Off className="size-5 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {error ? "링크를 열 수 없습니다" : "링크를 찾을 수 없습니다"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error ? "잠시 후 다시 시도해주세요." : "만료되었거나 해제된 링크입니다."}
        </p>
      </div>
    </Centered>
  )
}

export function LoadingPane() {
  return (
    <Centered>
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </Centered>
  )
}
