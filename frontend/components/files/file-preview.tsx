"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Info,
  Lock,
  Maximize2,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Share2,
  Trash2,
  X,
} from "lucide-react"

import { useToast } from "@/components/ui-custom/use-toast"
import { api } from "@/lib/api-client"
import * as e2e from "@/lib/e2e/session"
import { invalidateApi } from "@/lib/hooks/use-api"
import type { NodeResponse } from "@/lib/types/api"
import { cn } from "@/lib/utils"

import {
  KIND_META,
  KindIcon,
  PreviewContent,
  ZOOMS,
  ZOOM_FIT,
  canLoadPreview,
  downloadSource,
  ownsKeyboard,
  fileKindOf,
  renderModeOf,
  usePreviewContent,
} from "./preview-common"
import { InfoPanel, SharePanel, VersionsPanel } from "./preview-panels"

interface Props {
  node: NodeResponse
  /** 현재 보기의 파일들 (표시 순서): 이전/다음 */
  siblings?: NodeResponse[]
  vaultRootId: string | null
  ensureUnlocked?: () => Promise<void>
  onClose: () => void
  onShare?: (node: NodeResponse) => void
  /** 삭제, 복원 뒤 목록을 다시 받게 */
  onChanged?: () => void
}

type Section = "info" | "versions" | "share"

const T = "file-preview"

/** 브라우저에서 바로 그릴 수 있는 파일인지 (이미지, PDF, 동영상, 오디오, 텍스트) */
export function isPreviewable(node: NodeResponse): boolean {
  return node.kind === "file" && renderModeOf(node.mime, node.name) !== "none"
}

/** 보안 폴더 파일 이름은 암호문: 잠금해제 후 복호화 */
function useDisplayName(node: NodeResponse, vaultRootId: string | null, ensureUnlocked?: () => Promise<void>) {
  const [dec, setDec] = useState<{ id: string; name: string } | null>(null)
  useEffect(() => {
    if (!vaultRootId) return
    let cancelled = false
    void (async () => {
      try {
        if (!e2e.isUnlocked()) await ensureUnlocked?.()
        const name = await e2e.decryptName(vaultRootId, node.name)
        if (!cancelled) setDec({ id: node.id, name })
      } catch {
        if (!cancelled) setDec({ id: node.id, name: "" })
      }
    })()
    return () => {
      cancelled = true
    }
    // ensureUnlocked 는 렌더마다 새 함수일 수 있다: 노드가 바뀔 때만 다시 푼다.
  }, [node.id, node.name, vaultRootId]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!vaultRootId) return { name: node.name, ready: true }
  if (dec?.id !== node.id) return { name: "", ready: false }
  return { name: dec.name || "잠긴 파일", ready: !!dec.name }
}

/**
 * 파일 미리보기 창: 왼쪽 미리보기, 오른쪽 정보/버전/공유/삭제 패널.
 *
 * presigned URL 은 열 때마다 새로 발급(짧은 TTL), referrerPolicy=no-referrer.
 * 보안 폴더 파일은 암호문을 받아 브라우저에서 복호화한 blob 으로 보여준다.
 * z-index 는 공유 모달, 잠금해제 모달(z-50) 아래에 둔다: 이 창 위에서 열린다.
 */
export function FilePreview({
  node: initial,
  siblings,
  vaultRootId,
  ensureUnlocked,
  onClose,
  onShare,
  onChanged,
}: Props) {
  const { toast } = useToast()
  const rootRef = useRef<HTMLDivElement>(null)
  const [currentId, setCurrentId] = useState(initial.id)
  const [deleted, setDeleted] = useState<string[]>([])
  const [zoom, setZoom] = useState(ZOOM_FIT)
  const [side, setSide] = useState(true)
  const [section, setSection] = useState<Section>("info")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rev, setRev] = useState(0)

  const files = useMemo(() => {
    const base = (siblings?.length ? siblings : [initial]).filter(
      (f) => f.kind === "file" && !deleted.includes(f.id),
    )
    // 처음 연 파일이 목록에 없으면(목록 밖에서 열었을 때) 앞에 붙인다.
    if (currentId === initial.id && !deleted.includes(initial.id) && !base.some((f) => f.id === initial.id))
      return [initial, ...base]
    return base
  }, [siblings, initial, deleted, currentId])
  const index = Math.max(0, files.findIndex((f) => f.id === currentId))
  const node: NodeResponse | undefined = files[index]

  const go = useCallback(
    (delta: number) => {
      if (files.length < 2) return
      const next = files[(index + delta + files.length) % files.length]
      setCurrentId(next.id)
      setZoom(ZOOM_FIT)
      setConfirmDelete(false)
    },
    [files, index],
  )

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!ownsKeyboard(rootRef.current, e)) return
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowRight") go(1)
      else if (e.key === "ArrowLeft") go(-1)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go, onClose])

  if (!node) return null
  return (
    <div ref={rootRef} tabIndex={-1} className="outline-none" data-testid={T}>
      <div className="fixed inset-0 z-[45] bg-black/40 dark:bg-black/60" onClick={onClose} data-testid={`${T}-backdrop`} />
      <PreviewWindow
        key={node.id}
        node={node}
        index={index}
        total={files.length}
        vaultRootId={vaultRootId}
        ensureUnlocked={ensureUnlocked}
        onClose={onClose}
        onShare={onShare}
        go={go}
        zoom={zoom}
        setZoom={setZoom}
        side={side}
        setSide={setSide}
        section={section}
        setSection={setSection}
        confirmDelete={confirmDelete}
        setConfirmDelete={setConfirmDelete}
        busy={busy}
        rev={rev}
        onRestored={() => {
          setRev((r) => r + 1)
          onChanged?.()
        }}
        onDelete={async () => {
          setBusy(true)
          try {
            await api(`/api/v1/nodes/${node.id}`, { method: "DELETE" })
            toast.success(vaultRootId ? "영구 삭제했습니다" : "휴지통으로 이동했습니다")
            invalidateApi("/api/v1/nodes")
            invalidateApi("/api/v1/me/storage")
            onChanged?.()
            setConfirmDelete(false)
            if (files.length <= 1) {
              onClose()
              return
            }
            setCurrentId(files[(index + 1) % files.length].id)
            setDeleted((d) => [...d, node.id])
            setZoom(ZOOM_FIT)
          } catch (e) {
            toast.error(`삭제 실패: ${(e as Error).message}`)
          } finally {
            setBusy(false)
          }
        }}
      />
    </div>
  )
}

function PreviewWindow({
  node,
  index,
  total,
  vaultRootId,
  ensureUnlocked,
  onClose,
  onShare,
  go,
  zoom,
  setZoom,
  side,
  setSide,
  section,
  setSection,
  confirmDelete,
  setConfirmDelete,
  busy,
  rev,
  onRestored,
  onDelete,
}: {
  node: NodeResponse
  index: number
  total: number
  vaultRootId: string | null
  ensureUnlocked?: () => Promise<void>
  onClose: () => void
  onShare?: (node: NodeResponse) => void
  go: (delta: number) => void
  zoom: number
  setZoom: (fn: (z: number) => number) => void
  side: boolean
  setSide: (fn: (v: boolean) => boolean) => void
  section: Section
  setSection: (s: Section) => void
  confirmDelete: boolean
  setConfirmDelete: (v: boolean) => void
  busy: boolean
  rev: number
  onRestored: () => void
  onDelete: () => Promise<void>
}) {
  const { toast } = useToast()
  const inVault = !!vaultRootId && !!node.wrapped_dek
  const { name, ready } = useDisplayName(node, vaultRootId, ensureUnlocked)
  const kind = fileKindOf(node.mime, name)
  const mode = renderModeOf(node.mime, name)
  const enabled = ready && canLoadPreview(mode, node.size_bytes, inVault)
  const source = {
    path: `/api/v1/nodes/${node.id}/download-url?purpose=preview`,
    wrappedDek: node.wrapped_dek,
    vaultRootId,
    ensureUnlocked,
  }
  const content = usePreviewContent(source, mode, name, enabled, rev)
  const zoomable = mode === "image" && enabled && !!content.src
  const [downloading, setDownloading] = useState(false)

  async function download() {
    setDownloading(true)
    try {
      await downloadSource({ ...source, path: `/api/v1/nodes/${node.id}/download-url` }, name || node.name)
    } catch (e) {
      toast.error(`다운로드 실패: ${(e as Error).message}`)
    } finally {
      setDownloading(false)
    }
  }

  const iconBtn = "rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"

  return (
    <div
      className="fixed inset-2 z-[45] flex flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl duration-150 animate-in fade-in zoom-in-95 sm:inset-x-8 sm:inset-y-6 lg:inset-x-16 lg:inset-y-10 dark:ring-1 dark:ring-foreground/10"
      role="dialog"
      aria-modal="true"
      aria-label={name}
      data-testid={`${T}-window`}
    >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-3">
        <div className="flex shrink-0 items-center rounded-md border border-border">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={total < 2}
            title="이전"
            data-testid={`${T}-prev`}
            className="rounded-l-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-12 border-x border-border px-2 text-center text-xs text-muted-foreground tabular-nums" data-testid={`${T}-position`}>
            {index + 1} / {total}
          </span>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={total < 2}
            title="다음"
            data-testid={`${T}-next`}
            className="rounded-r-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
          {inVault && <Lock className="size-3.5 shrink-0 text-muted-foreground" />}
          <KindIcon kind={kind} />
          <span className="truncate font-medium text-foreground" title={name} data-testid={`${T}-name`}>
            {name}
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={download}
            disabled={downloading || !ready}
            data-testid={`${T}-download`}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            <Download className="size-3.5" />
            <span className="hidden sm:inline">다운로드</span>
          </button>
          <button
            type="button"
            onClick={() => setSide((v) => !v)}
            title="패널"
            data-testid={`${T}-panel-toggle`}
            className={cn(iconBtn, "hidden md:inline-flex")}
          >
            {side ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
          </button>
          <button type="button" onClick={onClose} title="닫기" data-testid={`${T}-close`} className={iconBtn}>
            <X className="size-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 bg-muted/40" data-testid={`${T}-stage`}>
          <PreviewContent
            mode={mode}
            kind={kind}
            name={name}
            size={node.size_bytes}
            content={content}
            enabled={enabled}
            zoom={ZOOMS[zoom]}
            testid={T}
            onDownload={download}
          />
          {zoomable && (
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border bg-background/90 p-1 shadow-lg backdrop-blur">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0, z - 1))}
                disabled={zoom === 0}
                title="축소"
                data-testid={`${T}-zoom-out`}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <Minus className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(() => ZOOM_FIT)}
                data-testid={`${T}-zoom-reset`}
                className="w-12 rounded-full py-1 text-xs text-foreground tabular-nums hover:bg-muted"
              >
                {ZOOMS[zoom]}%
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
                disabled={zoom === ZOOMS.length - 1}
                title="확대"
                data-testid={`${T}-zoom-in`}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <Plus className="size-3.5" />
              </button>
              <span className="mx-1 h-4 w-px bg-border" />
              <button
                type="button"
                onClick={() => setZoom(() => ZOOM_FIT)}
                title="맞춤"
                data-testid={`${T}-zoom-fit`}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Maximize2 className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        {side && (
          <aside className="hidden w-[340px] shrink-0 flex-col border-l border-border bg-background md:flex" data-testid={`${T}-panel`}>
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
                  <KindIcon kind={kind} className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground" title={name}>
                    {name}
                  </p>
                  <p className="text-xs text-muted-foreground">{KIND_META[kind].label}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-1.5">
                <Tile id="info" icon={Info} label="정보" active={section === "info"} onClick={() => setSection("info")} />
                <Tile
                  id="versions"
                  icon={History}
                  label="버전 기록"
                  active={section === "versions"}
                  onClick={() => setSection("versions")}
                />
                <Tile id="share" icon={Share2} label="공유" active={section === "share"} onClick={() => setSection("share")} />
                <Tile
                  id="delete"
                  icon={Trash2}
                  label={confirmDelete ? (vaultRootId ? "영구 삭제" : "확인") : "삭제"}
                  danger
                  active={confirmDelete}
                  disabled={busy}
                  onClick={() => {
                    if (confirmDelete) void onDelete()
                    else setConfirmDelete(true)
                  }}
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {section === "info" && <InfoPanel node={node} name={name} kind={kind} vaultRootId={vaultRootId} />}
              {section === "versions" && (
                <VersionsPanel
                  node={node}
                  name={name || node.name}
                  vaultRootId={vaultRootId}
                  ensureUnlocked={ensureUnlocked}
                  onRestored={onRestored}
                />
              )}
              {section === "share" && <SharePanel node={node} onShare={onShare} />}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

function Tile({
  id,
  icon: Icon,
  label,
  active,
  danger,
  disabled,
  onClick,
}: {
  id: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  active?: boolean
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={`${T}-tab-${id}`}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] transition-colors disabled:opacity-50",
        danger
          ? active
            ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
            : "border-border text-muted-foreground hover:border-rose-200 hover:text-rose-600 dark:hover:border-rose-900 dark:hover:text-rose-400"
          : active
            ? "border-foreground/20 bg-muted text-foreground"
            : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  )
}
