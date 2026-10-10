"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Download, Loader2, RotateCcw, Trash2, X } from "lucide-react"

import { useAppContext } from "@/components/providers/app-context"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui-custom/use-confirm"
import { useToast } from "@/components/ui-custom/use-toast"
import { api } from "@/lib/api-client"
import { invalidateApi, useApiGet } from "@/lib/hooks/use-api"
import type { FileVersionResponse, NodeResponse } from "@/lib/types/api"
import { cn } from "@/lib/utils"
import { formatBytes } from "@/lib/utils/format"

import {
  Avatar,
  Delta,
  KindIcon,
  PreviewContent,
  canLoadPreview,
  dayKey,
  dayLabel,
  downloadSource,
  ownsKeyboard,
  fileKindOf,
  formatShortDateTime,
  formatTime,
  renderModeOf,
  usePreviewContent,
} from "./preview-common"

const T = "files-versions"
const CURRENT = "current"
const RETENTION_DAYS = 30

interface Entry {
  id: string
  no: number
  size: number
  savedAt: string
  savedBy: string | null
  savedByName: string | null
  current: boolean
  /** 바로 이전 버전과 크기 차이 (첫 버전은 null) */
  delta: number | null
}

/**
 * 파일 버전 기록 (ADR-0022). 왼쪽 날짜별 타임라인, 오른쪽 고른 버전 미리보기.
 * 열람, 다운로드, 복원 = 쓰기 권한, 삭제 = 관리 권한: 내 개인 파일이거나 시스템 관리자일 때만.
 * 현재 내용은 버전 목록에 없으므로 노드 자체를 맨 위 "현재" 항목으로 보탠다.
 */
export function VersionHistoryModal({
  node,
  displayName,
  vaultRootId,
  ensureUnlocked,
  onClose,
}: {
  node: NodeResponse
  displayName: string
  vaultRootId: string | null
  ensureUnlocked?: () => Promise<void>
  onClose: () => void
}) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const { authUser, isSystemAdmin } = useAppContext()
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState<string>(CURRENT)
  const [asking, setAsking] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const url = `/api/v1/nodes/${node.id}/versions`
  const { data, error, isLoading, mutate } = useApiGet<FileVersionResponse[]>(url)
  const canDelete = isSystemAdmin || (node.scope === "personal" && node.owner_id === authUser?.id)

  const entries = useMemo<Entry[]>(() => {
    const list = data ?? []
    const out: Entry[] = [
      {
        id: CURRENT,
        no: list.length + 1,
        size: node.size_bytes ?? 0,
        // 현재 내용을 저장한 사람과 시각. 버전 도입 전 노드는 없어서 수정 시각으로.
        savedAt: node.content_updated_at ?? node.updated_at,
        savedBy: node.content_updated_by ?? null,
        savedByName: node.content_updated_by_name ?? null,
        current: true,
        delta: null,
      },
      ...list.map((v, i) => ({
        id: v.id,
        no: list.length - i,
        size: v.size_bytes,
        savedAt: v.saved_at,
        savedBy: v.saved_by,
        savedByName: v.saved_by_name,
        current: false,
        delta: null,
      })),
    ]
    for (let i = 0; i < out.length; i++) out[i].delta = out[i + 1] ? out[i].size - out[i + 1].size : null
    return out
  }, [data, node.size_bytes, node.updated_at, node.content_updated_at, node.content_updated_by, node.content_updated_by_name])

  const groups = useMemo(() => {
    const res: { key: string; label: string; items: Entry[] }[] = []
    for (const x of entries) {
      const k = dayKey(x.savedAt)
      const last = res[res.length - 1]
      if (last?.key === k) last.items.push(x)
      else res.push({ key: k, label: dayLabel(x.savedAt), items: [x] })
    }
    return res
  }, [entries])

  const people = useMemo(() => {
    const m = new Map<string, string>()
    if (node.content_updated_by) m.set(node.content_updated_by, node.content_updated_by_name ?? node.content_updated_by)
    for (const v of data ?? []) m.set(v.saved_by, v.saved_by_name ?? v.saved_by)
    return [...m.entries()]
  }, [data, node.content_updated_by, node.content_updated_by_name])

  const v = entries.find((x) => x.id === sel) ?? entries[0]
  const sourcePath = v.current ? `/api/v1/nodes/${node.id}/download-url` : `${url}/${v.id}/download-url`
  const source = { path: sourcePath, wrappedDek: v.current ? node.wrapped_dek : null, vaultRootId, ensureUnlocked }
  const kind = fileKindOf(node.mime, displayName)
  const mode = renderModeOf(node.mime, displayName)
  const enabled = canLoadPreview(mode, v.size, !!vaultRootId)
  const content = usePreviewContent(
    { ...source, path: v.current ? `${sourcePath}?purpose=preview` : sourcePath },
    mode,
    displayName,
    enabled,
  )

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || busy || !ownsKeyboard(rootRef.current, e)) return
      if (asking) setAsking(false)
      else onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [asking, busy, onClose])

  async function download() {
    setDownloading(true)
    try {
      await downloadSource(source, displayName)
    } catch (e) {
      toast.error(`다운로드 실패: ${(e as Error).message}`)
    } finally {
      setDownloading(false)
    }
  }

  async function restore() {
    setBusy(true)
    try {
      await api(`${url}/${v.id}/restore`, { method: "POST" })
      toast.success("복원했습니다")
      invalidateApi("/api/v1/me/storage")
      // 파일 목록을 새로 받으면 목록이 다시 그려지며 이 모달도 닫힌다: 이동 모달처럼 먼저 닫는다.
      onClose()
      invalidateApi("/api/v1/nodes")
    } catch (e) {
      toast.error(`복원 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    const ok = await confirm({
      title: "버전 삭제",
      description: `v${v.no} (${formatShortDateTime(v.savedAt)}) 을(를) 영구 삭제합니다. 되돌릴 수 없습니다.`,
      confirmText: "삭제",
      variant: "destructive",
    })
    if (!ok) return
    setBusy(true)
    try {
      await api(`${url}/${v.id}`, { method: "DELETE" })
      invalidateApi("/api/v1/me/storage")
      setSel(CURRENT)
      await mutate()
    } catch (e) {
      toast.error(`삭제 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const versionCount = data?.length ?? 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-3 dark:bg-black/50"
      onClick={() => !busy && onClose()}
    >
      <div
        ref={rootRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`${displayName} 버전 기록`}
        className="flex h-[620px] max-h-[calc(100dvh-1.5rem)] w-[900px] max-w-full overflow-hidden rounded-xl border border-border bg-background shadow-2xl outline-none dark:ring-1 dark:ring-foreground/10"
        onClick={(e) => e.stopPropagation()}
        data-testid={`${T}-modal`}
      >
        {/* 타임라인 */}
        <div className="flex w-[300px] shrink-0 flex-col border-r border-border md:w-[320px]">
          <div className="px-5 pt-5 pb-4">
            <p className="text-xs font-medium text-muted-foreground">버전 기록</p>
            <h3 className="mt-0.5 truncate text-lg font-semibold text-foreground" title={displayName}>
              {displayName}
            </h3>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              {people.length > 0 && (
                <div className="flex -space-x-1.5">
                  {people.slice(0, 5).map(([id, name]) => (
                    <Avatar key={id} id={id} name={name} size={20} className="ring-2 ring-background" />
                  ))}
                </div>
              )}
              <span>
                {versionCount + 1}개 버전, {RETENTION_DAYS}일 보관
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-4 pb-5" data-testid={`${T}-list`}>
            {isLoading ? (
              <div className="flex justify-center py-8 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
              </div>
            ) : error ? (
              <p className="px-1 py-6 text-center text-xs text-rose-600 dark:text-rose-400" data-testid={`${T}-error`}>
                {error.status === 403 ? "편집 권한이 있어야 볼 수 있습니다" : `불러오지 못했습니다: ${error.message}`}
              </p>
            ) : (
              <>
                {groups.map((g) => (
                  <section key={g.key}>
                    <h4 className="sticky top-0 z-10 bg-background/95 px-1 pt-4 pb-2 text-xs font-semibold text-foreground backdrop-blur">
                      {g.label}
                    </h4>
                    <ol>
                      {g.items.map((x, i) => {
                        const on = x.id === v.id
                        const last = i === g.items.length - 1
                        const who = x.savedByName ?? x.savedBy ?? (x.current ? "현재 버전" : "")
                        return (
                          <li key={x.id} className="relative flex gap-3 pb-1">
                            {!last && <span className="absolute top-9 bottom-0 left-[17px] w-px bg-border" />}
                            <div className="relative z-[1] pt-2 pl-1">
                              {x.current ? (
                                <span className="grid size-[26px] place-items-center rounded-full bg-muted outline-2 outline-offset-2 outline-primary ring-[3px] ring-background dark:outline-foreground/60">
                                  <KindIcon kind={kind} className="size-3.5" />
                                </span>
                              ) : (
                                <Avatar
                                  id={x.savedBy ?? x.id}
                                  name={who}
                                  size={26}
                                  className="ring-[3px] ring-background"
                                />
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSel(x.id)
                                setAsking(false)
                              }}
                              data-testid={x.current ? `${T}-item-current` : `files-version-${x.id}`}
                              className={cn(
                                "mb-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                                on ? "border-border bg-card shadow-sm" : "border-transparent hover:bg-muted/50",
                              )}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5 text-sm">
                                  <span className="truncate font-medium text-foreground">{who}</span>
                                  <span className="shrink-0 text-muted-foreground">{formatTime(x.savedAt)}</span>
                                </span>
                                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <span>v{x.no},</span>
                                  <span className="tabular-nums">{formatBytes(x.size)}</span>
                                  <Delta n={x.delta} />
                                </span>
                              </span>
                              {x.current && (
                                <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary dark:bg-primary/25 dark:text-foreground">
                                  현재
                                </span>
                              )}
                            </button>
                          </li>
                        )
                      })}
                    </ol>
                  </section>
                ))}
                {versionCount === 0 && (
                  <p className="px-1 pt-2 text-xs text-muted-foreground" data-testid={`${T}-empty`}>
                    이전 버전이 없습니다.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* 고른 버전 */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[72px] shrink-0 items-center gap-3 px-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-foreground" data-testid={`${T}-selected`}>
                  버전 {v.no}
                </span>
                {v.current && (
                  <span className="rounded-full bg-emerald-50 px-2 py-px text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    현재
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {v.savedByName || v.savedBy ? `${v.savedByName ?? v.savedBy}, ` : ""}
                {formatShortDateTime(v.savedAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              title="닫기"
              data-testid={`${T}-close`}
              className="-mr-2 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>

          <div className="relative mx-6 min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/40" data-testid={`${T}-preview`}>
            <PreviewContent
              key={v.id}
              mode={mode}
              kind={kind}
              name={displayName}
              size={v.size}
              content={content}
              enabled={enabled}
              compact
              testid={`${T}-preview`}
              onDownload={download}
            />
          </div>

          <div className="mt-4 flex h-14 shrink-0 items-center gap-2 border-t border-border px-6">
            {asking ? (
              <>
                <RotateCcw size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  <span className="font-medium">v{v.no}</span>으로 복원
                  <span className="text-muted-foreground">, 현재 버전은 기록에 남음</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => setAsking(false)} disabled={busy} data-testid={`${T}-restore-cancel`}>
                  취소
                </Button>
                <Button size="sm" onClick={restore} disabled={busy} data-testid={`${T}-restore-confirm`}>
                  복원
                </Button>
              </>
            ) : (
              <>
                {canDelete && !v.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={remove}
                    disabled={busy}
                    data-testid={`${T}-delete`}
                    className="gap-1.5 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
                  >
                    <Trash2 size={14} /> 삭제
                  </Button>
                )}
                <div className="flex-1" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={download}
                  disabled={downloading || busy}
                  data-testid={`${T}-download`}
                  className="min-w-24 gap-1.5"
                >
                  {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  다운로드
                </Button>
                <Button
                  size="sm"
                  onClick={() => setAsking(true)}
                  disabled={v.current || busy}
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
  )
}
