"use client"

import { useState } from "react"
import { Download, RotateCcw, Trash2, X } from "lucide-react"
import { useToast } from "@/components/ui-custom/use-toast"

import { useAppContext } from "@/components/providers/app-context"
import { useConfirm } from "@/components/ui-custom/use-confirm"
import { api } from "@/lib/api-client"
import * as e2e from "@/lib/e2e/session"
import { invalidateApi, useApiGet } from "@/lib/hooks/use-api"
import type { FileVersionDownloadUrl, FileVersionResponse, NodeResponse } from "@/lib/types/api"
import { formatBytes, formatDateTime } from "@/lib/utils/format"

/**
 * 파일 버전 기록 (ADR-0022). 열람·다운로드·복원 = 쓰기 권한(행 버튼 노출 조건),
 * 삭제 = 관리 권한 — 내 개인 파일이거나 시스템 관리자일 때만 버튼을 보인다.
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
  const url = `/api/v1/nodes/${node.id}/versions`
  const { data, isLoading, mutate } = useApiGet<FileVersionResponse[]>(url)
  const canDelete =
    isSystemAdmin || (node.scope === "personal" && node.owner_id === authUser?.id)

  async function download(v: FileVersionResponse) {
    try {
      const res = await api<FileVersionDownloadUrl>(`${url}/${v.id}/download-url`, {
        method: "POST",
      })
      if (vaultRootId && res.wrapped_dek) {
        // 보안 폴더 — 암호문을 받아 브라우저에서 복호화 (S3 presigned 직접 호출이라 fetch).
        await ensureUnlocked?.()
        const resp = await fetch(res.url)
        if (!resp.ok) throw new Error(`다운로드 ${resp.status}`)
        const plain = await e2e.decryptDownload(vaultRootId, res.wrapped_dek, await resp.arrayBuffer())
        const href = URL.createObjectURL(new Blob([plain as unknown as BlobPart]))
        const a = document.createElement("a")
        a.href = href
        a.download = displayName
        a.click()
        URL.revokeObjectURL(href)
        return
      }
      window.open(res.url, "_blank", "noopener")
    } catch (e) {
      toast.error(`다운로드 실패: ${(e as Error).message}`)
    }
  }

  async function restore(v: FileVersionResponse) {
    const ok = await confirm({
      title: "이 버전으로 복원",
      description: `${formatDateTime(v.saved_at)} 버전으로 되돌립니다. 지금 내용은 버전 기록에 남습니다.`,
      confirmText: "복원",
    })
    if (!ok) return
    setBusy(true)
    try {
      await api(`${url}/${v.id}/restore`, { method: "POST" })
      toast.success("복원했습니다")
      invalidateApi("/api/v1/me/storage")
      // 파일 목록을 새로 받으면 목록이 다시 그려지며 이 모달도 닫힌다 — 이동 모달처럼 먼저 닫는다.
      onClose()
      invalidateApi("/api/v1/nodes")
    } catch (e) {
      toast.error(`복원 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function remove(v: FileVersionResponse) {
    const ok = await confirm({
      title: "버전 삭제",
      description: `${formatDateTime(v.saved_at)} 버전을 영구 삭제합니다. 되돌릴 수 없습니다.`,
      confirmText: "삭제",
      variant: "destructive",
    })
    if (!ok) return
    setBusy(true)
    try {
      await api(`${url}/${v.id}`, { method: "DELETE" })
      invalidateApi("/api/v1/me/storage")
      await mutate()
    } catch (e) {
      toast.error(`삭제 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const versions = data ?? []
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={() => !busy && onClose()}
    >
      <div
        className="flex max-h-[80vh] w-[32rem] max-w-[92vw] flex-col overflow-hidden rounded-lg bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
        data-testid="files-versions-modal"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="min-w-0 truncate text-base font-semibold text-gray-900">
            {displayName} 버전 기록
          </h3>
          <button
            onClick={onClose}
            data-testid="files-versions-close"
            className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>
        <p className="border-b border-gray-100 px-5 py-2 text-xs text-gray-500">
          덮어쓰기 전 내용을 30일간 보관합니다. 같은 사람이 10분 안에 다시 저장하면 하나로 묶입니다.
        </p>
        <div className="overflow-y-auto">
          {isLoading ? (
            <p className="px-5 py-6 text-center text-xs text-gray-500">불러오는 중…</p>
          ) : versions.length === 0 ? (
            <p className="px-5 py-6 text-center text-xs text-gray-500" data-testid="files-versions-empty">
              이전 버전이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center gap-3 px-5 py-2.5"
                  data-testid={`files-version-${v.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-gray-900">{formatDateTime(v.saved_at)}</div>
                    <div className="text-xs text-gray-500">
                      {v.saved_by_name ?? v.saved_by} · {formatBytes(v.size_bytes)}
                    </div>
                  </div>
                  <button
                    onClick={() => download(v)}
                    disabled={busy}
                    data-testid={`files-version-${v.id}-download`}
                    className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40"
                    title="다운로드"
                  >
                    <Download size={14} />
                  </button>
                  <button
                    onClick={() => restore(v)}
                    disabled={busy}
                    data-testid={`files-version-${v.id}-restore`}
                    className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40"
                    title="이 버전으로 복원"
                  >
                    <RotateCcw size={14} />
                  </button>
                  {canDelete && (
                    <button
                      onClick={() => remove(v)}
                      disabled={busy}
                      data-testid={`files-version-${v.id}-delete`}
                      className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-rose-600 disabled:opacity-40"
                      title="버전 삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
