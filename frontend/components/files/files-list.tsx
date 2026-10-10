"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ChevronDown, ChevronUp, Download, File, Folder, FolderInput, History, Pencil, RotateCcw, Share2, Trash2 } from "lucide-react"

// 문서류 확장자 — 타입 필터의 "문서" 분류에 사용.
const _DOC_EXTS = new Set([
  "doc","docx","docm","dot","dotx","dotm","odt","ott","rtf","txt",
  "html","htm","mht","epub","fb2","xps","oxps","djvu","hwp","hwpx",
  "xls","xlsx","xlsm","xlt","xltx","xltm","ods","ots","csv",
  "ppt","pptx","pptm","pot","potx","potm","pps","ppsx","ppsm","odp","otp",
  "pdf",
])

function isDocExt(name: string): boolean {
  const dot = name.lastIndexOf(".")
  if (dot < 0) return false
  return _DOC_EXTS.has(name.slice(dot + 1).toLowerCase())
}

const _IMAGE_EXTS = new Set([
  "png","jpg","jpeg","gif","webp","svg","bmp","tiff","tif","heic","heif","avif","ico",
])
function extOf(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase()
}

// 타입 필터 카테고리 — 폴더 / 이미지 / 문서 / 기타.
type FileFilter = "all" | "folder" | "image" | "document" | "other"
const FILTER_LABELS: Record<FileFilter, string> = {
  all: "전체",
  folder: "폴더",
  image: "이미지",
  document: "문서",
  other: "기타",
}

// 정렬 기준·방향. 폴더는 항상 파일보다 위(파일 매니저 관례).
type SortKey = "name" | "size" | "updated"
type SortDir = "asc" | "desc"

// pending 노드 판별 — 진행 중 vs 방치. status 만으로는 구별 불가(둘 다 pending)
// 이라 시각 기반 휴리스틱: 최근이면 업로드 중(데스크톱 multipart 등), 오래되면
// 끊긴 업로드. 데스크톱 동기화가 큰 파일을 pending 상태로 한동안 두기 때문.
const PENDING_STALE_MS = 30 * 60 * 1000 // 30분
function isStalePending(n: NodeResponse): boolean {
  return Date.now() - new Date(n.updated_at).getTime() > PENDING_STALE_MS
}

import { api, apiDownload } from "@/lib/api-client"
import * as e2e from "@/lib/e2e/session"
import { FilePreview, isPreviewable } from "@/components/files/file-preview"
import { ShareModal } from "@/components/files/share-modal"
import { MoveModal } from "@/components/files/move-modal"
import { VersionHistoryModal } from "@/components/files/version-history-modal"
import { useConfirm } from "@/components/ui-custom/use-confirm"
import { useToast } from "@/components/ui-custom/use-toast"
import { invalidateApi } from "@/lib/hooks/use-api"
import { formatBytes, formatDateTime } from "@/lib/utils/format"
import type { DownloadUrlResponse, NodeResponse } from "@/lib/types/api"

interface Props {
  nodes: NodeResponse[]
  trash?: boolean
  // E2E vault (ADR-0016) — null 이면 일반 폴더.
  vaultRootId?: string | null
  ensureUnlocked?: () => Promise<void>
  unlocked?: boolean
  // 쓰기 권한 (write/manage). false 면 편집·공유·삭제 버튼 숨김 (읽기전용 멤버).
  canWrite?: boolean
}

export function FilesList({
  nodes,
  trash = false,
  vaultRootId = null,
  ensureUnlocked,
  unlocked = false,
  canWrite = true,
}: Props) {
  const { toast } = useToast()
  const confirm = useConfirm()
  // 부서 폴더 컨텍스트(from=team-folders)면 하위 폴더 이동 시에도 유지.
  const sp = useSearchParams()
  const ctxSuffix = sp?.get("from") === "team-folders" ? "&from=team-folders" : ""
  const [sharing, setSharing] = useState<NodeResponse | null>(null)
  const [previewing, setPreviewing] = useState<NodeResponse | null>(null)
  const [renaming, setRenaming] = useState<NodeResponse | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [renameBusy, setRenameBusy] = useState(false)
  const [moving, setMoving] = useState<NodeResponse | null>(null)
  const [versioning, setVersioning] = useState<NodeResponse | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  // 정렬·필터 (UI 환경설정 — localStorage 로 새로고침 후 유지).
  const [filter, setFilter] = useState<FileFilter>("all")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  useEffect(() => {
    try {
      const raw = localStorage.getItem("files:view")
      if (raw) {
        const v = JSON.parse(raw)
        if (v.filter) setFilter(v.filter)
        if (v.sortKey) setSortKey(v.sortKey)
        if (v.sortDir) setSortDir(v.sortDir)
      }
    } catch {
      // 무시 — 기본값 사용
    }
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(
        "files:view",
        JSON.stringify({ filter, sortKey, sortDir }),
      )
    } catch {
      // 무시
    }
  }, [filter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  // E2E vault — 파일명은 ciphertext. 잠금해제 후에만 복호화해 표시.
  const [decNames, setDecNames] = useState<Record<string, string>>({})
  useEffect(() => {
    // 잠겨있으면 복호화본 즉시 폐기 — 잠금 전환 시 평문이 화면에 남지 않게.
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
          out[n.id] = "🔒 (복호화 실패)"
        }
      }
      if (!cancelled) setDecNames(out)
    })()
    return () => {
      cancelled = true
    }
  }, [vaultRootId, unlocked, nodes])

  // 표시용 이름 — 3상태:
  //   vault 밖     → 원본
  //   vault+잠김   → "🔒 잠김" (원본 ciphertext·평문 절대 노출 X)
  //   vault+해제   → 복호화본 (진행 중이면 "🔒 …")
  const displayName = (n: NodeResponse): string => {
    if (!vaultRootId) return n.name
    if (!unlocked) return "🔒 잠김"
    return decNames[n.id] ?? "🔒 …"
  }

  function categoryOf(n: NodeResponse): FileFilter {
    if (n.kind === "folder") return "folder"
    const ext = extOf(n.name)
    if (_IMAGE_EXTS.has(ext)) return "image"
    if (isDocExt(n.name)) return "document"
    return "other"
  }

  // 필터 → 정렬. 폴더는 항상 파일보다 위, 그 안에서 선택한 기준으로 정렬.
  const displayNodes = useMemo(() => {
    const filtered =
      filter === "all" ? nodes : nodes.filter((n) => categoryOf(n) === filter)
    const dir = sortDir === "asc" ? 1 : -1
    const cmp = (a: NodeResponse, b: NodeResponse): number => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1
      let r = 0
      if (sortKey === "size") {
        r = (a.size_bytes ?? 0) - (b.size_bytes ?? 0)
      } else if (sortKey === "updated") {
        r = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
      }
      // name 또는 tie-break — displayName 로 자연 정렬.
      if (r === 0) {
        r = displayName(a).localeCompare(displayName(b), "ko", {
          numeric: true,
          sensitivity: "base",
        })
        return r * dir
      }
      return r * dir
    }
    return [...filtered].sort(cmp)
    // displayName 은 decNames(vault) 에 의존 — deps 에 포함해 잠금해제 후 재정렬.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, filter, sortKey, sortDir, decNames])

  // 이 폴더에 해당 카테고리가 하나도 없으면(예: 저장된 필터가 stale) '전체'로 복귀.
  useEffect(() => {
    if (filter !== "all" && nodes.every((n) => categoryOf(n) !== filter)) {
      setFilter("all")
    }
  }, [nodes, filter])

  // 타입 필터 칩 — 항목이 있는 카테고리만 노출 (+ 항상 '전체').
  const catCounts = useMemo(() => {
    const c: Record<FileFilter, number> = {
      all: nodes.length,
      folder: 0,
      image: 0,
      document: 0,
      other: 0,
    }
    for (const n of nodes) c[categoryOf(n)]++
    return c
  }, [nodes])

  // nodes 가 바뀌면 더 이상 존재하지 않는 id 는 제외
  const validSelection = useMemo(() => {
    const visibleIds = new Set(nodes.map((n) => n.id))
    const filtered = new Set<string>()
    for (const id of selected) if (visibleIds.has(id)) filtered.add(id)
    return filtered
  }, [selected, nodes])

  // 전체선택·표시는 현재 필터로 보이는 행 기준.
  const allChecked =
    displayNodes.length > 0 && displayNodes.every((n) => validSelection.has(n.id))
  const someChecked = validSelection.size > 0 && !allChecked

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allChecked) displayNodes.forEach((n) => next.delete(n.id))
      else displayNodes.forEach((n) => next.add(n.id))
      return next
    })
  }

  async function download(node: NodeResponse) {
    try {
      const res = await api<DownloadUrlResponse>(
        `/api/v1/nodes/${node.id}/download-url`,
        { method: "POST" },
      )
      // E2E vault — 암호문 받아 복호화 후 평문 파일로 저장 (브라우저가 직접 못 엶).
      if (vaultRootId && node.wrapped_dek) {
        await ensureUnlocked?.()
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
      window.open(res.url, "_blank", "noopener")
    } catch (e) {
      toast.error(`다운로드 실패: ${(e as Error).message}`)
    }
  }

  async function softDelete(node: NodeResponse) {
    // 보안 폴더 파일은 휴지통을 거치지 않고 즉시 영구 삭제 (복구 불가).
    const inVault = vaultRootId !== null
    const ok = await confirm({
      title: inVault ? "영구 삭제" : "휴지통으로 이동",
      description: inVault
        ? `'${displayName(node)}' 을(를) 영구 삭제합니다. 보안 폴더 파일은 휴지통을 거치지 않으며 복구할 수 없습니다.`
        : `'${displayName(node)}' 을(를) 휴지통으로 옮기시겠습니까?`,
      confirmText: inVault ? "영구 삭제" : "삭제",
      variant: "destructive",
    })
    if (!ok) return
    try {
      await api(`/api/v1/nodes/${node.id}`, { method: "DELETE" })
      toast.success(inVault ? "영구 삭제했습니다" : "휴지통으로 이동했습니다")
      invalidateApi("/api/v1/nodes")
    } catch (e) {
      toast.error(`삭제 실패: ${(e as Error).message}`)
    }
  }

  async function restore(node: NodeResponse) {
    try {
      await api(`/api/v1/nodes/${node.id}/restore`, { method: "POST" })
      toast.success("복원했습니다")
      invalidateApi("/api/v1/nodes")
    } catch (e) {
      toast.error(`복원 실패: ${(e as Error).message}`)
    }
  }

  async function bulkSoftDelete() {
    const ids = [...validSelection]
    const inVault = vaultRootId !== null
    const proceed = await confirm({
      title: inVault ? "영구 삭제" : "휴지통으로 이동",
      description: inVault
        ? `선택한 ${ids.length}개 항목을 영구 삭제합니다. 보안 폴더 항목은 복구할 수 없습니다.`
        : `선택한 ${ids.length}개 항목을 휴지통으로 옮기시겠습니까?`,
      confirmText: inVault ? "영구 삭제" : "삭제",
      variant: "destructive",
    })
    if (!proceed) return
    const results = await Promise.allSettled(
      ids.map((id) => api(`/api/v1/nodes/${id}`, { method: "DELETE" })),
    )
    const ok = results.filter((r) => r.status === "fulfilled").length
    const fail = results.length - ok
    toast.success(
      fail === 0
        ? `${ok}개 항목 휴지통으로 이동`
        : `${ok}개 이동 · ${fail}개 실패`,
    )
    setSelected(new Set())
    invalidateApi("/api/v1/nodes")
  }

  async function doRename() {
    if (!renaming) return
    const name = renameValue.trim()
    if (!name || name === displayName(renaming)) {
      setRenaming(null)
      return
    }
    setRenameBusy(true)
    try {
      await api(`/api/v1/nodes/${renaming.id}`, {
        method: "PATCH",
        body: { name },
      })
      toast.success("이름을 변경했습니다")
      setRenaming(null)
      invalidateApi("/api/v1/nodes")
    } catch (e) {
      toast.error(`이름 변경 실패: ${(e as Error).message}`)
    } finally {
      setRenameBusy(false)
    }
  }

  async function bulkRestore() {
    const ids = [...validSelection]
    const results = await Promise.allSettled(
      ids.map((id) =>
        api(`/api/v1/nodes/${id}/restore`, { method: "POST" }),
      ),
    )
    const ok = results.filter((r) => r.status === "fulfilled").length
    const fail = results.length - ok
    toast.success(
      fail === 0 ? `${ok}개 항목 복원` : `${ok}개 복원 · ${fail}개 실패`,
    )
    setSelected(new Set())
    invalidateApi("/api/v1/nodes")
  }

  const sortIcon = (key: SortKey) =>
    sortKey === key ? (
      sortDir === "asc" ? (
        <ChevronUp size={12} className="shrink-0" />
      ) : (
        <ChevronDown size={12} className="shrink-0" />
      )
    ) : null

  if (nodes.length === 0) {
    return (
      <div
        className={`rounded-lg border border-dashed p-12 text-center text-sm ${
          vaultRootId
            ? "border-gray-700 bg-gray-800 text-gray-400"
            : "border-gray-300 text-gray-500"
        }`}
        data-testid="files-empty"
      >
        {trash ? "휴지통이 비어 있습니다." : "여기에 파일을 업로드하거나 폴더를 만들어 보세요."}
      </div>
    )
  }

  const filterChips = (["all", "folder", "image", "document", "other"] as FileFilter[]).filter(
    (k) => k === "all" || catCounts[k] > 0,
  )

  return (
    <div className="space-y-3">
      {filterChips.length > 2 && (
        <div
          className="flex flex-wrap items-center gap-1.5"
          data-testid="files-filter-bar"
        >
          {filterChips.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              data-testid={`files-filter-${k}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filter === k
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {FILTER_LABELS[k]}
              <span className={filter === k ? "opacity-70" : "text-gray-400"}>
                {" "}
                {catCounts[k]}
              </span>
            </button>
          ))}
        </div>
      )}

      {validSelection.size > 0 && (
        <div
          className="flex items-center justify-between rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm"
          data-testid="files-bulk-bar"
        >
          <span className="text-gray-700">
            <strong>{validSelection.size}개</strong> 선택됨
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelected(new Set())}
              data-testid="files-bulk-clear"
              className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
            >
              선택 해제
            </button>
            {trash ? (
              <button
                onClick={bulkRestore}
                data-testid="files-bulk-restore"
                className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
              >
                선택 복원
              </button>
            ) : (
              <button
                onClick={bulkSoftDelete}
                data-testid="files-bulk-delete"
                className="rounded bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700"
              >
                선택 삭제
              </button>
            )}
          </div>
        </div>
      )}

      <div
        className={`overflow-x-auto rounded-lg border ${
          vaultRootId ? "files-table-dark" : "border-gray-200 bg-white"
        }`}
      >
        <table className="w-full text-sm" data-testid="files-tree">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="w-10 px-4 py-2">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked
                  }}
                  onChange={toggleAll}
                  data-testid="files-select-all"
                  aria-label="전체 선택"
                />
              </th>
              <th className="px-4 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort("name")}
                  data-testid="files-sort-name"
                  className="inline-flex items-center gap-1 font-medium hover:text-gray-800"
                >
                  이름 {sortIcon("name")}
                </button>
              </th>
              <th className="hidden w-32 px-4 py-2 font-medium sm:table-cell">
                <button
                  type="button"
                  onClick={() => toggleSort("size")}
                  data-testid="files-sort-size"
                  className="inline-flex items-center gap-1 font-medium hover:text-gray-800"
                >
                  크기 {sortIcon("size")}
                </button>
              </th>
              <th className="hidden w-44 px-4 py-2 font-medium sm:table-cell">
                <button
                  type="button"
                  onClick={() => toggleSort("updated")}
                  data-testid="files-sort-updated"
                  className="inline-flex items-center gap-1 font-medium hover:text-gray-800"
                >
                  수정 {sortIcon("updated")}
                </button>
              </th>
              <th className="w-28 px-4 py-2 text-right font-medium">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {displayNodes.map((n) => {
              const Icon = n.kind === "folder" ? Folder : File
              const folderHref =
                n.kind === "folder" && !trash
                  ? `/files?scope=${n.scope}&folder=${n.id}${ctxSuffix}`
                  : null
              const checked = validSelection.has(n.id)
              return (
                <tr
                  key={n.id}
                  data-testid={`files-row-${n.id}`}
                  className={`hover:bg-gray-50 ${checked ? "bg-blue-50/50" : ""}`}
                >
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(n.id)}
                      data-testid={`files-row-${n.id}-select`}
                      aria-label={`${n.name} 선택`}
                    />
                  </td>
                  <td className="max-w-0 px-4 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon
                        size={16}
                        className={`shrink-0 ${n.kind === "folder" ? "text-blue-600" : "text-gray-500"}`}
                      />
                      {folderHref ? (
                        <Link
                          href={folderHref}
                          data-testid={`files-row-${n.id}-open`}
                          title={displayName(n)}
                          className="min-w-0 truncate text-left text-gray-900 hover:underline"
                        >
                          {displayName(n)}
                        </Link>
                      ) : n.kind === "file" && !trash ? (
                        <button
                          onClick={() => {
                            if (n.status === "pending") {
                              toast.error(
                                isStalePending(n)
                                  ? "업로드 중 오류가 발생한 파일입니다. 휴지통으로 삭제 후 다시 업로드해주세요."
                                  : "업로드 중인 파일입니다. 완료되면 열 수 있습니다.",
                              )
                              return
                            }
                            // vault 파일은 미리보기 대신 다운로드(복호화) — 서버가 평문을
                            // 못 주므로 inline preview 불가.
                            if (vaultRootId) {
                              void download(n)
                            } else if (isPreviewable(n)) {
                              setPreviewing(n)
                            } else {
                              void download(n)
                            }
                          }}
                          className="min-w-0 truncate text-left text-gray-900 hover:underline"
                          data-testid={`files-row-${n.id}-open`}
                          title={displayName(n)}
                        >
                          {displayName(n)}
                        </button>
                      ) : (
                        <span className="min-w-0 truncate text-gray-700" title={displayName(n)}>
                          {displayName(n)}
                        </span>
                      )}
                      {n.status === "pending" &&
                        (isStalePending(n) ? (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-700">
                            업로드 실패
                          </span>
                        ) : (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                            업로드 중
                          </span>
                        ))}
                    </div>
                  </td>
                  <td className="hidden px-4 py-2 text-gray-600 sm:table-cell">
                    {n.kind === "file"
                      ? formatBytes(
                          // 암호화 파일(wrapped_dek)은 평문 크기 = 저장 크기 − 28(iv12+tag16)
                          n.wrapped_dek && n.size_bytes != null
                            ? Math.max(0, n.size_bytes - 28)
                            : n.size_bytes,
                        )
                      : "-"}
                  </td>
                  <td className="hidden px-4 py-2 text-gray-600 sm:table-cell">
                    {formatDateTime(n.updated_at)}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      {trash ? (
                        <button
                          onClick={() => restore(n)}
                          data-testid={`files-row-${n.id}-restore`}
                          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                          title="복원"
                        >
                          <RotateCcw size={14} />
                        </button>
                      ) : (
                        <>
                          {n.kind === "folder" ? (
                            <button
                              onClick={async () => {
                                try {
                                  await apiDownload(
                                    `/api/v1/nodes/${n.id}/zip`,
                                    `${displayName(n)}.zip`,
                                  )
                                } catch (e) {
                                  toast.error(`다운로드 실패: ${(e as Error).message}`)
                                }
                              }}
                              data-testid={`files-row-${n.id}-zip`}
                              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                              title="폴더를 zip 으로 다운로드"
                            >
                              <Download size={14} />
                            </button>
                          ) : (
                            n.status !== "pending" && (
                              <button
                                onClick={() => download(n)}
                                data-testid={`files-row-${n.id}-download`}
                                className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                                title="다운로드"
                              >
                                <Download size={14} />
                              </button>
                            )
                          )}
                          {canWrite && (
                            <>
                              {!vaultRootId && (
                                <button
                                  onClick={() => {
                                    setRenaming(n)
                                    setRenameValue(displayName(n))
                                  }}
                                  data-testid={`files-row-${n.id}-rename`}
                                  className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                                  title="이름 변경"
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                              {n.kind === "file" && n.status !== "pending" && (
                                <button
                                  onClick={() => setVersioning(n)}
                                  data-testid={`files-row-${n.id}-versions`}
                                  className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                                  title="버전 기록"
                                >
                                  <History size={14} />
                                </button>
                              )}
                              {!vaultRootId && (
                                <button
                                  onClick={() => setMoving(n)}
                                  data-testid={`files-row-${n.id}-move`}
                                  className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                                  title="이동"
                                >
                                  <FolderInput size={14} />
                                </button>
                              )}
                              {/* vault 안에서는 개별 공유 숨김 — 보안 폴더는 폴더(루트) 단위로만 공유.
                                  vault 루트 자체는 부모 목록(회사 공유)에서 공유. */}
                              {!vaultRootId && (
                                <button
                                  onClick={() => setSharing(n)}
                                  data-testid={`files-row-${n.id}-share`}
                                  className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                                  title="공유"
                                >
                                  <Share2 size={14} />
                                </button>
                              )}
                              <button
                                onClick={() => softDelete(n)}
                                data-testid={`files-row-${n.id}-delete`}
                                className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-rose-600"
                                title="삭제"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {sharing && (
        <ShareModal
          node={sharing}
          displayName={displayName(sharing)}
          onClose={() => setSharing(null)}
        />
      )}
      {previewing && (
        <FilePreview node={previewing} onClose={() => setPreviewing(null)} />
      )}
      {moving && (
        <MoveModal node={moving} onClose={() => setMoving(null)} />
      )}
      {versioning && (
        <VersionHistoryModal
          node={versioning}
          displayName={displayName(versioning)}
          vaultRootId={vaultRootId}
          ensureUnlocked={ensureUnlocked}
          onClose={() => setVersioning(null)}
        />
      )}
      {renaming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => !renameBusy && setRenaming(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              void doRename()
            }}
            className="w-80 space-y-3 rounded-lg bg-white p-5 shadow-lg"
            data-testid="files-rename-modal"
          >
            <h3 className="text-base font-semibold text-gray-900">이름 변경</h3>
            <input
              autoFocus
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onFocus={(e) => e.target.select()}
              data-testid="files-rename-input"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenaming(null)}
                data-testid="files-rename-cancel"
                className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={renameBusy || !renameValue.trim()}
                data-testid="files-rename-save"
                className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                저장
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
