"use client"

/**
 * 파일 목록 (playground files-page D): 목록/갤러리, 종류 탭, 정렬, 다중 선택, 행 메뉴.
 * 파일을 누르면 미리보기, 폴더를 누르면 들어간다. 업로드 진행 행은 목적지 폴더 목록 안에만.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowDownToLine, ArrowDownUp, ArrowUp, Download, Folder, FolderInput, Share2, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { api, apiDownload } from "@/lib/api-client"
import * as e2e from "@/lib/e2e/session"
import { invalidateApi } from "@/lib/hooks/use-api"
import { useUploads } from "@/lib/uploads/store"
import { cn } from "@/lib/utils"
import { formatBytes } from "@/lib/utils/format"
import { logger } from "@/lib/utils/logger"
import type { DownloadUrlResponse, NodeResponse } from "@/lib/types/api"
import { FilePreview } from "@/components/files/file-preview"
import { ShareModal } from "@/components/files/share-modal"
import { MoveModal } from "@/components/files/move-modal"
import { VersionHistoryModal } from "@/components/files/version-history-modal"
import { useConfirm } from "@/components/ui-custom/use-confirm"
import { useToast } from "@/components/ui-custom/use-toast"
import { FILTERS, FileGlyph, kindOf, matchesFilter, plainSize, relativeTime, type TypeFilter } from "@/components/files/file-meta"
import { Badges, Checkbox, RenameInput, isStalePending, type ItemCtx } from "@/components/files/file-item-parts"
import { FileRowMenu, rowActions, type RowAction } from "@/components/files/file-row-menu"
import { FilesGallery } from "@/components/files/files-gallery"
import { UploadRows } from "@/components/files/upload-rows"

export type FilesView = "list" | "grid"
type SortKey = "name" | "size" | "updated"
interface Sort {
  key: SortKey
  dir: "asc" | "desc"
}
const SORT_LABEL: Record<SortKey, string> = { name: "이름", size: "크기", updated: "수정한 날짜" }
const COLS = 5

interface Props {
  nodes: NodeResponse[]
  view?: FilesView
  // E2E vault (ADR-0016): null 이면 일반 폴더.
  vaultRootId?: string | null
  ensureUnlocked?: () => Promise<void>
  unlocked?: boolean
  // 쓰기 권한 (write/manage). false 면 편집, 공유, 삭제 숨김 (읽기전용 멤버).
  canWrite?: boolean
  /** 업로드 목적지 키 (lib/uploads/store destKeyOf). null 이면 진행 행 없음 (공유받음 등) */
  destKey?: string | null
  /** 파일을 끌어 올리는 중: 목록 맨 위에 놓을 자리 표시 */
  dragging?: boolean
  dropLabel?: string
  /** 보안 폴더 루트 id (배지) */
  vaultIds?: Set<string>
  /** 부서 폴더 루트 id (배지) */
  teamFolderIds?: Set<string>
  /** 툴바 오른쪽 (저장 공간 막대) */
  toolbarExtra?: ReactNode
  /** 비었을 때 문구 (기본 "빈 폴더") */
  emptyLabel?: string
}

const EMPTY_SET = new Set<string>()

export function FilesList({
  nodes,
  view = "list",
  vaultRootId = null,
  ensureUnlocked,
  unlocked = false,
  canWrite = true,
  destKey = null,
  dragging = false,
  dropLabel = "",
  vaultIds = EMPTY_SET,
  teamFolderIds = EMPTY_SET,
  toolbarExtra,
  emptyLabel,
}: Props) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const router = useRouter()
  const uploads = useUploads()
  const [sharing, setSharing] = useState<NodeResponse | null>(null)
  const [previewing, setPreviewing] = useState<NodeResponse | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [moving, setMoving] = useState<NodeResponse | null>(null)
  const [versioning, setVersioning] = useState<NodeResponse | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const inVault = vaultRootId !== null

  // 정렬과 필터 (UI 환경설정: localStorage 로 새로고침 후 유지).
  const [filter, setFilter] = useState<TypeFilter>("all")
  const [sort, setSort] = useState<Sort>({ key: "name", dir: "asc" })
  useEffect(() => {
    try {
      const raw = localStorage.getItem("files:view")
      if (!raw) return
      const v = JSON.parse(raw)
      if (FILTERS.some((f) => f.key === v.filter)) setFilter(v.filter)
      if (v.sortKey in SORT_LABEL) setSort({ key: v.sortKey, dir: v.sortDir === "desc" ? "desc" : "asc" })
    } catch {
      // 무시: 기본값 사용
    }
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem("files:view", JSON.stringify({ filter, sortKey: sort.key, sortDir: sort.dir }))
    } catch {
      // 무시
    }
  }, [filter, sort])

  // 업로드 큐: 진행 중인 노드(pending 파일, 만드는 중인 폴더)는 진행 행으로만 보이고,
  // 끝난 노드는 "새 항목" 배지.
  const { hereUploads, hiddenIds, newIds } = useMemo(() => {
    const hidden = new Set<string>()
    const fresh = new Set<string>()
    for (const u of uploads) {
      if (!u.nodeId) continue
      if (u.state === "done") fresh.add(u.nodeId)
      else if (u.state !== "canceled") hidden.add(u.nodeId)
    }
    const here = destKey
      ? uploads.filter((u) => u.destKey === destKey && (u.state === "queued" || u.state === "uploading" || u.state === "failed"))
      : []
    return { hereUploads: here, hiddenIds: hidden, newIds: fresh }
  }, [uploads, destKey])

  const visibleNodes = useMemo(() => nodes.filter((n) => !hiddenIds.has(n.id)), [nodes, hiddenIds])

  // E2E vault: 파일명은 ciphertext. 잠금해제 후에만 복호화해 표시.
  const [decNames, setDecNames] = useState<Record<string, string>>({})
  useEffect(() => {
    // 잠겨있으면 복호화본 즉시 폐기: 잠금 전환 시 평문이 화면에 남지 않게.
    if (!vaultRootId || !unlocked) {
      setDecNames({})
      return
    }
    let cancelled = false
    void (async () => {
      const out: Record<string, string> = {}
      for (const n of nodes) {
        try {
          out[n.id] = await e2e.decryptName(vaultRootId, n.name)
        } catch {
          out[n.id] = "(복호화 실패)"
        }
      }
      if (!cancelled) setDecNames(out)
    })()
    return () => {
      cancelled = true
    }
  }, [vaultRootId, unlocked, nodes])

  // 표시용 이름: vault 밖은 원본, vault 잠김은 "잠김"(ciphertext 노출 X), 해제는 복호화본.
  const displayName = (n: NodeResponse): string => {
    if (!vaultRootId) return n.name
    if (!unlocked) return "잠김"
    return decNames[n.id] ?? "…"
  }
  const kindOfNode = (n: NodeResponse) => kindOf(displayName(n), n.mime, n.kind === "folder")

  // 필터 → 정렬. 폴더는 항상 파일보다 위.
  const displayNodes = useMemo(() => {
    const filtered = visibleNodes.filter((n) => matchesFilter(kindOfNode(n), filter))
    const sign = sort.dir === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => {
      // 방금 올린 항목은 진행 행 바로 아래 (맨 위)
      const na = newIds.has(a.id)
      if (na !== newIds.has(b.id)) return na ? -1 : 1
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1
      let r = 0
      if (sort.key === "size") r = (plainSize(a) ?? 0) - (plainSize(b) ?? 0)
      else if (sort.key === "updated") r = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
      if (r === 0) r = displayName(a).localeCompare(displayName(b), "ko", { numeric: true, sensitivity: "base" })
      return r * sign
    })
    // displayName 은 decNames(vault) 에 의존: 잠금해제 후 재정렬.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNodes, filter, sort, decNames, unlocked, newIds])

  // 더 이상 보이지 않는 id 는 선택에서 제외
  const validSelection = useMemo(() => {
    const ids = new Set(displayNodes.map((n) => n.id))
    return new Set([...selected].filter((id) => ids.has(id)))
  }, [selected, displayNodes])
  const selectedNodes = displayNodes.filter((n) => validSelection.has(n.id))
  const allChecked = displayNodes.length > 0 && validSelection.size === displayNodes.length

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(displayNodes.map((n) => n.id)))
  }

  const folderHref = (n: NodeResponse) => {
    const sp = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null
    const ctx = sp?.get("from") === "team-folders" ? "&from=team-folders" : ""
    return `/files?scope=${n.scope}&folder=${n.id}${ctx}`
  }

  function openFile(n: NodeResponse) {
    if (n.status === "pending") {
      toast.error(
        isStalePending(n)
          ? "업로드 중 오류가 발생한 파일입니다. 휴지통으로 삭제 후 다시 업로드해주세요."
          : "업로드 중",
      )
      return
    }
    setPreviewing(n)
  }

  function activate(n: NodeResponse) {
    if (renamingId === n.id) return
    if (n.kind === "folder") router.push(folderHref(n))
    else openFile(n)
  }

  async function download(node: NodeResponse, bulk = false) {
    try {
      if (node.kind === "folder") {
        await apiDownload(`/api/v1/nodes/${node.id}/zip`, `${displayName(node)}.zip`)
        return
      }
      const res = await api<DownloadUrlResponse>(`/api/v1/nodes/${node.id}/download-url`, { method: "POST" })
      // E2E vault: 암호문 받아 복호화 후 평문 파일로 저장 (브라우저가 직접 못 엶).
      if (vaultRootId && node.wrapped_dek) {
        await ensureUnlocked?.()
        // presigned S3 URL (외부 스토리지) 이라 api() 가 아닌 fetch 로 받는다.
        const resp = await fetch(res.url)
        if (!resp.ok) throw new Error(`다운로드 ${resp.status}`)
        const ct = await resp.arrayBuffer()
        const plain = await e2e.decryptDownload(vaultRootId, node.wrapped_dek, ct)
        const name = await e2e.decryptName(vaultRootId, node.name)
        const url = URL.createObjectURL(new Blob([plain as unknown as BlobPart]))
        const a = document.createElement("a")
        a.href = url
        a.download = name
        a.click()
        URL.revokeObjectURL(url)
        return
      }
      if (bulk) {
        // 여러 개를 연달아 window.open 하면 팝업 차단: attachment URL 을 숨은 iframe 으로.
        const frame = document.createElement("iframe")
        frame.style.display = "none"
        frame.src = res.url
        document.body.appendChild(frame)
        setTimeout(() => frame.remove(), 60_000)
        return
      }
      window.open(res.url, "_blank", "noopener")
    } catch (e) {
      toast.error(`다운로드 실패: ${(e as Error).message}`)
    }
  }

  async function softDelete(nodesToDelete: NodeResponse[]) {
    if (nodesToDelete.length === 0) return
    const one = nodesToDelete.length === 1 ? nodesToDelete[0] : null
    // 보안 폴더 파일은 휴지통을 거치지 않고 즉시 영구 삭제 (복구 불가).
    const ok = await confirm({
      title: inVault ? "영구 삭제" : "휴지통으로 이동",
      description: inVault
        ? one
          ? `'${displayName(one)}' 을(를) 영구 삭제합니다. 보안 폴더 파일은 휴지통을 거치지 않으며 복구할 수 없습니다.`
          : `선택한 ${nodesToDelete.length}개 항목을 영구 삭제합니다. 보안 폴더 항목은 복구할 수 없습니다.`
        : one
          ? `'${displayName(one)}' 을(를) 휴지통으로 옮기시겠습니까?`
          : `선택한 ${nodesToDelete.length}개 항목을 휴지통으로 옮기시겠습니까?`,
      confirmText: inVault ? "영구 삭제" : "삭제",
      variant: "destructive",
    })
    if (!ok) return
    const results = await Promise.allSettled(
      nodesToDelete.map((n) => api(`/api/v1/nodes/${n.id}`, { method: "DELETE" })),
    )
    const okCount = results.filter((r) => r.status === "fulfilled").length
    const fail = results.length - okCount
    if (fail === 0) {
      toast.success(
        one ? (inVault ? "영구 삭제했습니다" : "휴지통으로 이동했습니다") : `${okCount}개 항목 ${inVault ? "영구 삭제" : "휴지통으로 이동"}`,
      )
    } else {
      const first = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined
      toast.error(one ? `삭제 실패: ${(first?.reason as Error)?.message}` : `${okCount}개 삭제, ${fail}개 실패`)
    }
    setSelected(new Set())
    invalidateApi("/api/v1/nodes")
    invalidateApi("/api/v1/me")
  }

  async function finishRename(node: NodeResponse, value: string | null) {
    setRenamingId(null)
    const name = value?.trim()
    if (!name || name === displayName(node)) return
    try {
      // 보안 폴더 안은 이름도 암호문으로 저장
      let stored = name
      if (vaultRootId) {
        await ensureUnlocked?.()
        stored = await e2e.encryptName(vaultRootId, name)
      }
      await api(`/api/v1/nodes/${node.id}`, { method: "PATCH", body: { name: stored } })
      toast.success("이름을 변경했습니다")
      invalidateApi("/api/v1/nodes")
    } catch (e) {
      toast.error(`이름 변경 실패: ${(e as Error).message}`)
    }
  }

  function act(a: RowAction, n: NodeResponse) {
    logger.debug("files_row_action", { category: "ui", action: a })
    if (a === "open") activate(n)
    else if (a === "download") void download(n)
    else if (a === "share") setSharing(n)
    else if (a === "rename") setRenamingId(n.id)
    else if (a === "move") setMoving(n)
    else if (a === "versions") setVersioning(n)
    else if (a === "delete") void softDelete([n])
  }

  const ctx: ItemCtx = {
    displayName,
    kindOf: kindOfNode,
    isSelected: (id) => validSelection.has(id),
    anySelected: validSelection.size > 0,
    toggle: toggleOne,
    activate,
    actionsFor: (n) => rowActions(n, { canWrite, inVault }),
    act,
    renamingId,
    finishRename: (n, v) => void finishRename(n, v),
    isVaultFolder: (n) => n.kind === "folder" && vaultIds.has(n.id),
    isTeamFolder: (n) => n.kind === "folder" && teamFolderIds.has(n.id),
    isNew: (n) => newIds.has(n.id),
    uploadsInto: (n) => uploads.filter((u) => u.dest.parentId === n.id),
    folderHref,
  }

  const empty = visibleNodes.length === 0 && hereUploads.length === 0
  const one = selectedNodes.length === 1 ? selectedNodes[0] : null
  const oneActions = one ? rowActions(one, { canWrite, inVault }) : null
  const files = displayNodes.filter((n) => n.kind === "file" && n.status !== "pending")

  const dropStrip = dragging && (
    <div
      className="flex h-11 items-center justify-center gap-2 rounded-md border-2 border-dashed border-primary/50 bg-primary/5 text-sm font-medium text-primary animate-in fade-in"
      data-testid="files-drop-overlay"
    >
      <ArrowDownToLine className="size-4" />
      {dropLabel}
    </div>
  )

  return (
    <div className="space-y-3">
      {/* 툴바: 평소엔 종류 탭 + 항목 수 + 저장 공간, 선택하면 일괄 작업 막대 */}
      <div className="sticky top-0 z-10 -mx-1 flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-background/90 px-1 py-1 backdrop-blur">
        {validSelection.size > 0 ? (
          <div
            className="flex items-center gap-1 rounded-xl bg-foreground py-1 pr-1 pl-3 text-background shadow-lg"
            data-testid="files-bulk-bar"
          >
            <span className="mr-2 text-sm font-medium tabular-nums">{validSelection.size}개 선택</span>
            <span className="mr-1 h-4 w-px bg-background/20" />
            <BulkButton
              testid="files-bulk-download"
              icon={<Download />}
              label="다운로드"
              onClick={() => {
                for (const n of selectedNodes) if (n.status !== "pending") void download(n, true)
              }}
            />
            {oneActions?.has("move") && (
              <BulkButton testid="files-bulk-move" icon={<FolderInput />} label="이동" onClick={() => setMoving(one)} />
            )}
            {oneActions?.has("share") && (
              <BulkButton testid="files-bulk-share" icon={<Share2 />} label="공유" onClick={() => setSharing(one)} />
            )}
            {canWrite && (
              <BulkButton
                testid="files-bulk-delete"
                icon={<Trash2 />}
                label="삭제"
                danger
                onClick={() => void softDelete(selectedNodes)}
              />
            )}
            <Button
              data-testid="files-bulk-clear"
              variant="ghost"
              size="icon-sm"
              aria-label="선택 해제"
              onClick={() => setSelected(new Set())}
              className="ml-1 text-background/70 hover:bg-background/15 hover:text-background dark:hover:bg-background/15"
            >
              <X />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5" data-testid="files-filter-bar">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  data-testid={`files-filter-${f.key}`}
                  aria-pressed={filter === f.key}
                  onClick={() => {
                    setFilter(f.key)
                    setSelected(new Set())
                  }}
                  className={cn(
                    "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                    filter === f.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground tabular-nums" data-testid="files-count">
                {displayNodes.length}개 항목
              </span>
              {toolbarExtra}
              {view === "grid" && <SortMenu sort={sort} setSort={setSort} />}
            </div>
          </>
        )}
      </div>

      {view === "list" ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full table-fixed text-sm" data-testid="files-tree">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="w-11 py-2 pl-4 font-medium">
                  <Checkbox
                    testid="files-select-all"
                    label="전체 선택"
                    checked={allChecked}
                    indeterminate={validSelection.size > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th className="py-2 pr-3 font-medium">
                  <SortHead sort={sort} setSort={setSort} k="name" label="이름" />
                </th>
                <th className="hidden w-28 py-2 pr-4 font-medium sm:table-cell">
                  <SortHead sort={sort} setSort={setSort} k="size" label="크기" right />
                </th>
                <th className="w-20 py-2 pr-2 font-medium sm:w-32 lg:w-48">
                  <SortHead sort={sort} setSort={setSort} k="updated" label="수정" right />
                </th>
                <th className="w-12 py-2 pr-3 sm:w-20" />
              </tr>
            </thead>
            <tbody>
              {dragging && (
                <tr>
                  <td colSpan={COLS} className="px-3 pt-2 pb-1">
                    {dropStrip}
                  </td>
                </tr>
              )}
              {hereUploads.length > 0 && <UploadRows items={hereUploads} cols={COLS} />}
              {displayNodes.map((n) => (
                <ListRow key={n.id} node={n} ctx={ctx} />
              ))}
            </tbody>
          </table>
          {empty && <EmptyState vault={inVault} label={emptyLabel} />}
          {!empty && displayNodes.length === 0 && hereUploads.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground" data-testid="files-filter-empty">
              항목 없음
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {dropStrip}
          {hereUploads.length > 0 && (
            <div className="overflow-hidden rounded-xl border bg-card">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col />
                  <col className="hidden w-28 sm:table-column" />
                  <col className="w-20 sm:w-32 lg:w-48" />
                  <col className="w-12 sm:w-20" />
                </colgroup>
                <tbody>
                  <UploadRows items={hereUploads} cols={COLS - 1} withSelect={false} />
                </tbody>
              </table>
            </div>
          )}
          {empty ? (
            <div className="rounded-xl border border-dashed">
              <EmptyState vault={inVault} label={emptyLabel} />
            </div>
          ) : displayNodes.length === 0 && hereUploads.length === 0 ? (
            <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground" data-testid="files-filter-empty">
              항목 없음
            </p>
          ) : (
            <FilesGallery items={displayNodes} ctx={ctx} />
          )}
        </div>
      )}

      {sharing && <ShareModal node={sharing} displayName={displayName(sharing)} onClose={() => setSharing(null)} />}
      {previewing && (
        <FilePreview
          node={previewing}
          siblings={files}
          vaultRootId={vaultRootId}
          ensureUnlocked={ensureUnlocked}
          onClose={() => setPreviewing(null)}
          onShare={canWrite && !inVault ? (n) => setSharing(n) : undefined}
          onChanged={() => invalidateApi("/api/v1/nodes")}
        />
      )}
      {moving && <MoveModal node={moving} onClose={() => setMoving(null)} />}
      {versioning && (
        <VersionHistoryModal
          node={versioning}
          displayName={displayName(versioning)}
          vaultRootId={vaultRootId}
          ensureUnlocked={ensureUnlocked}
          onClose={() => setVersioning(null)}
        />
      )}
    </div>
  )
}

function ListRow({ node, ctx }: { node: NodeResponse; ctx: ItemCtx }) {
  const checked = ctx.isSelected(node.id)
  const renaming = ctx.renamingId === node.id
  const name = ctx.displayName(node)
  const actions = ctx.actionsFor(node)
  const isFolder = node.kind === "folder"
  return (
    <tr
      data-testid={`files-row-${node.id}`}
      onClick={(e) => {
        // 이름 링크, 버튼, 입력은 각자 처리
        if ((e.target as HTMLElement).closest("a,button,input")) return
        if (ctx.anySelected) ctx.toggle(node.id)
        else ctx.activate(node)
      }}
      className={cn(
        "group h-12 cursor-pointer border-b border-border transition-colors last:border-b-0",
        checked ? "bg-primary/[0.06]" : "hover:bg-muted/50",
      )}
    >
      <td className="pl-4">
        <Checkbox
          testid={`files-row-${node.id}-select`}
          label={`${name} 선택`}
          checked={checked}
          onChange={() => ctx.toggle(node.id)}
          className={cn(!checked && !ctx.anySelected && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100")}
        />
      </td>
      <td className="max-w-0 pr-3">
        <div className="flex min-w-0 items-center gap-3">
          <FileGlyph kind={ctx.kindOf(node)} vault={ctx.isVaultFolder(node)} className="size-8" />
          {renaming ? (
            <RenameInput initial={name} isFolder={isFolder} onDone={(v) => ctx.finishRename(node, v)} />
          ) : (
            <>
              {isFolder ? (
                <Link
                  href={ctx.folderHref(node)}
                  data-testid={`files-row-${node.id}-open`}
                  title={name}
                  className="min-w-0 truncate font-medium text-foreground hover:underline"
                >
                  {name}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => ctx.activate(node)}
                  data-testid={`files-row-${node.id}-open`}
                  title={name}
                  className="min-w-0 truncate text-left font-medium text-foreground hover:underline"
                >
                  {name}
                </button>
              )}
              <Badges node={node} ctx={ctx} className="shrink-0" />
            </>
          )}
        </div>
      </td>
      <td className="hidden pr-4 text-right text-muted-foreground tabular-nums sm:table-cell">
        {isFolder ? "" : formatBytes(plainSize(node))}
      </td>
      <td className="truncate pr-2 text-right text-muted-foreground" title={new Date(node.updated_at).toLocaleString("ko-KR")}>
        {relativeTime(node.updated_at)}
      </td>
      <td className="pr-3">
        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100 pointer-coarse:opacity-100">
          {actions.has("share") && (
            <Button
              data-testid={`files-row-${node.id}-share`}
              variant="ghost"
              size="icon-sm"
              aria-label="공유"
              title="공유"
              onClick={() => ctx.act("share", node)}
              className="hidden text-muted-foreground sm:inline-flex"
            >
              <Share2 />
            </Button>
          )}
          <FileRowMenu node={node} actions={actions} onAction={ctx.act} />
        </div>
      </td>
    </tr>
  )
}

function SortHead({
  sort,
  setSort,
  k,
  label,
  right,
}: {
  sort: Sort
  setSort: (s: Sort) => void
  k: SortKey
  label: string
  right?: boolean
}) {
  const on = sort.key === k
  const Arrow = sort.dir === "asc" ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      data-testid={`files-sort-${k}`}
      onClick={() => setSort(on ? { key: k, dir: sort.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" })}
      className={cn("flex w-full items-center gap-1 font-medium hover:text-foreground", right && "justify-end", on && "text-foreground")}
    >
      {label}
      {on && <Arrow className="size-3" />}
    </button>
  )
}

function SortMenu({ sort, setSort }: { sort: Sort; setSort: (s: Sort) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button data-testid="files-sort-menu" variant="ghost" size="sm" className="text-muted-foreground">
          <ArrowDownUp />
          {SORT_LABEL[sort.key]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>정렬</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={sort.key} onValueChange={(k) => setSort({ ...sort, key: k as SortKey })}>
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <DropdownMenuRadioItem key={k} value={k} data-testid={`files-sort-menu-${k}`}>
              {SORT_LABEL[k]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={sort.dir} onValueChange={(d) => setSort({ ...sort, dir: d as Sort["dir"] })}>
          <DropdownMenuRadioItem value="asc" data-testid="files-sort-menu-asc">
            오름차순
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="desc" data-testid="files-sort-menu-desc">
            내림차순
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function BulkButton({
  testid,
  icon,
  label,
  danger,
  onClick,
}: {
  testid: string
  icon: ReactNode
  label: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <Button
      data-testid={testid}
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        "text-background hover:bg-background/15 hover:text-background dark:hover:bg-background/15",
        danger && "text-rose-300 hover:text-rose-200 dark:text-rose-700 dark:hover:text-rose-800",
      )}
    >
      {icon}
      {label}
    </Button>
  )
}

function EmptyState({ vault, label }: { vault: boolean; label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-muted-foreground" data-testid="files-empty">
      <Folder className="size-8 text-muted-foreground/50" strokeWidth={1.5} />
      {label ?? (vault ? "빈 보안 폴더" : "빈 폴더")}
    </div>
  )
}
