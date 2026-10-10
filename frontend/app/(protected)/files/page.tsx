"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { UploadCloud } from "lucide-react"

import { api } from "@/lib/api-client"
import { FilesBreadcrumb } from "@/components/files/files-breadcrumb"
import { FilesList } from "@/components/files/files-list"
import {
  FilesToolbar,
  type FilesToolbarHandle,
} from "@/components/files/files-toolbar"
import { FilesGuideButton } from "@/components/files/files-guide"
import { StorageUsage } from "@/components/files/storage-usage"
import { E2EUnlockModal } from "@/components/files/e2e-unlock-modal"
import { useToast } from "@/components/ui-custom/use-toast"
import { invalidateApi, useApiGet } from "@/lib/hooks/use-api"
import { useE2E } from "@/lib/e2e/use-e2e"
import { useConfirm } from "@/components/ui-custom/use-confirm"
import { useVaultContext } from "@/lib/e2e/use-vault-context"
import * as e2e from "@/lib/e2e/session"
import type { NodeScope, TeamFolderItem, TreeResponse } from "@/lib/types/api"

export default function FilesPage() {
  const { toast } = useToast()
  const confirm = useConfirm()
  const sp = useSearchParams()
  const trash = sp.get("trash") === "1"
  const sharedWithMe = sp.get("view") === "shared-with-me"
  const scopeParam = sp.get("scope")
  const scope: NodeScope = scopeParam === "shared" ? "shared" : "personal"
  const folderId = sp.get("folder")
  // 부서 폴더 메뉴를 통해 진입했는지: 빵부스러기/사이드바를 "부서 폴더"로 표기.
  const fromTeam = sp.get("from") === "team-folders"

  // ActiveCompanyGate 가 activeCompanyId ready 보장. race 차단 layout 차원.
  const apiPath = trash
    ? "/api/v1/nodes/trash"
    : sharedWithMe
      ? "/api/v1/nodes/shared-with-me"
      : `/api/v1/nodes/tree?scope=${scope}${folderId ? `&parent_id=${folderId}` : ""}`

  const { data, error, isLoading } = useApiGet<TreeResponse>(apiPath)

  // E2E vault (ADR-0016)
  const e2eUi = useE2E()
  const { requestUnlock, unlocked: e2eUnlocked } = e2eUi
  const vaultCtx = useVaultContext(trash || sharedWithMe ? null : folderId)
  const isEmptyFolder = !!folderId && (data?.nodes.length ?? 0) === 0
  // 현재 폴더가 팀(부서) 폴더 루트인지: 팀 폴더는 vault 전환 불가(가드), 버튼 숨김.
  const { data: teamFolders } = useApiGet<TeamFolderItem[]>(
    scope === "shared" && folderId ? "/api/v1/team-folders" : null,
  )
  const isTeamFolder =
    !!folderId && (teamFolders ?? []).some((t) => t.node_id === folderId)
  const showMakeVault =
    !trash &&
    !sharedWithMe &&
    !!folderId &&
    vaultCtx.canMakeVault &&
    isEmptyFolder &&
    !isTeamFolder
  // 비멤버가 들어온 보안 폴더: 업로드/액션 막고 명시적으로 안내.
  const vaultNoAccess = vaultCtx.vaultRootId !== null && !vaultCtx.hasAccess
  // 멤버지만 아직 잠금해제 안 함: 목록 자체를 숨김 (개수·크기·수정일·종류 노출 방지).
  const vaultLocked =
    vaultCtx.vaultRootId !== null && vaultCtx.hasAccess && !e2eUnlocked

  // 드래그앤드롭 업로드: 툴바가 마운트되는 조건과 동일할 때만 활성.
  const toolbarRef = useRef<FilesToolbarHandle>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const canUpload = !trash && !sharedWithMe && !vaultNoAccess && vaultCtx.canWrite

  function hasFiles(dt: DataTransfer | null) {
    return !!dt && Array.from(dt.types).includes("Files")
  }
  function onDragEnter(e: React.DragEvent) {
    if (!canUpload || !hasFiles(e.dataTransfer)) return
    e.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }
  function onDragOver(e: React.DragEvent) {
    if (!canUpload || !hasFiles(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
  }
  function onDragLeave(e: React.DragEvent) {
    if (!canUpload || !hasFiles(e.dataTransfer)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }
  function onDrop(e: React.DragEvent) {
    if (!canUpload || !hasFiles(e.dataTransfer)) return
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    void toolbarRef.current?.handleDrop(e.dataTransfer)
  }

  // vault 진입 시 잠금 상태면 자동으로 잠금해제 모달 (파일명·내용 복호화 위해).
  // 접근 권한 없는 vault 면 잠금해제해도 못 보므로 모달 띄우지 않음.
  useEffect(() => {
    if (vaultCtx.vaultRootId && vaultCtx.hasAccess && !e2eUnlocked) void requestUnlock()
  }, [vaultCtx.vaultRootId, vaultCtx.hasAccess, e2eUnlocked, requestUnlock])

  async function handleMakeVault() {
    if (!folderId) return
    const ok = await confirm({
      title: "보안 폴더로 전환",
      description:
        "이 폴더와 하위 내용이 종단간 암호화됩니다. 한 번 만든 보안 폴더는 다시 일반 폴더로 전환할 수 없습니다.",
      confirmText: "보안 폴더로 전환",
    })
    if (!ok) return
    try {
      await e2eUi.requestUnlock() // 잠금해제 보장 (모달 게이트)
      await e2e.createVault(folderId)
      toast.success("보안 폴더로 전환했습니다")
      invalidateApi("/api/v1/e2e/vaults")
      invalidateApi("/api/v1/nodes")
    } catch (err) {
      toast.error(`보안 폴더 전환 실패: ${(err as Error).message}`)
    }
  }

  return (
    <div
      className="relative h-full"
      data-testid="files-page"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragging && (
        <div
          className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 bg-gray-900/5 backdrop-blur-[1px]"
          data-testid="files-drop-overlay"
        >
          <UploadCloud size={40} className="text-gray-700" />
          <p className="text-sm font-semibold text-gray-800">
            여기에 놓아 업로드
          </p>
          <p className="text-xs text-gray-500">파일 · 폴더 모두 가능</p>
        </div>
      )}
      {/* 스크롤은 이 안에서만: overlay(위 absolute)는 바깥 anchor 에 붙어 항상 보이는 영역을 덮음 */}
      <div className="h-full overflow-y-auto px-4 py-8 sm:px-6 lg:px-8">
      <section className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          {trash ? (
            <h1 className="text-2xl font-bold text-gray-900">휴지통</h1>
          ) : sharedWithMe ? (
            <h1 className="text-2xl font-bold text-gray-900">공유받은 항목</h1>
          ) : (
            <div className="min-w-0 space-y-1">
              <h1 className="text-2xl font-bold text-gray-900">
                {fromTeam ? "부서 폴더" : scope === "personal" ? "내 파일" : "회사 공유"}
              </h1>
              {folderId && (
                <FilesBreadcrumb scope={scope} folderId={folderId} unlocked={e2eUnlocked} teamFolder={fromTeam} />
              )}
            </div>
          )}
          {trash && (data?.nodes.length ?? 0) > 0 && (
            <button
              onClick={async () => {
                const ok = await confirm({
                  title: "휴지통 비우기",
                  description: `휴지통의 ${data?.nodes.length}개 항목을 영구 삭제합니다. 되돌릴 수 없습니다.`,
                  confirmText: "영구 삭제",
                  variant: "destructive",
                })
                if (!ok) return
                try {
                  const res = await api<{ purged: number }>(
                    "/api/v1/nodes/trash",
                    { method: "DELETE" },
                  )
                  toast.success(`${res.purged}개 항목 영구 삭제`)
                  invalidateApi("/api/v1/nodes")
                } catch (e) {
                  toast.error(`비우기 실패: ${(e as Error).message}`)
                }
              }}
              data-testid="files-trash-empty-button"
              className="rounded bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700"
            >
              휴지통 비우기
            </button>
          )}
          {!trash && !sharedWithMe && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {/* 보안 폴더 배지: 권한과 무관하게 항상 표시 (읽기전용도) */}
              {vaultCtx.vaultRootId && !vaultNoAccess && (
                <span
                  className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"
                  data-testid="files-vault-badge"
                  title="이 폴더는 종단간 암호화됩니다"
                >
                  🔒 보안 폴더{!vaultCtx.canWrite && " · 읽기 전용"}
                </span>
              )}
              {isTeamFolder && (
                <span
                  className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
                  data-testid="files-team-folder-badge"
                  title="부서 폴더. 해당 부서(+하위) 인원이 접근합니다"
                >
                  👥 부서 폴더
                </span>
              )}
              <FilesGuideButton />
              {!vaultNoAccess && vaultCtx.canWrite && (
                <FilesToolbar
                  ref={toolbarRef}
                  scope={scope}
                  parentId={folderId}
                  vaultRootId={vaultCtx.vaultRootId}
                  ensureUnlocked={e2eUi.requestUnlock}
                  showMakeVault={showMakeVault}
                  onMakeVault={handleMakeVault}
                />
              )}
            </div>
          )}
        </div>

        {!trash && !sharedWithMe && !vaultCtx.vaultRootId && (
          <div className="flex justify-end">
            <StorageUsage />
          </div>
        )}

        {error ? (
          <div
            className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
            data-testid="files-error"
          >
            불러오지 못했습니다. 잠시 후 다시 시도해주세요.
          </div>
        ) : isLoading ? (
          <div className="text-sm text-gray-500">불러오는 중…</div>
        ) : vaultNoAccess ? (
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 p-8 text-center"
            data-testid="files-vault-no-access"
          >
            <div className="text-3xl">🔒</div>
            <p className="mt-3 text-sm font-semibold text-amber-900">
              이 보안 폴더에 접근 권한이 없습니다
            </p>
            <p className="mt-1 text-xs text-amber-700">
              내용을 보거나 파일을 올리려면 폴더 소유자에게 공유를 요청하세요.
            </p>
          </div>
        ) : vaultLocked ? (
          <div
            className="rounded-lg border border-gray-700 bg-gray-800 p-12 text-center"
            data-testid="files-vault-locked"
          >
            <div className="text-3xl">🔒</div>
            <p className="mt-3 text-sm font-semibold text-gray-100">
              보안 폴더가 잠겨 있습니다
            </p>
            <p className="mt-1 text-xs text-gray-400">
              파일 개수·크기·수정일·종류를 포함한 모든 내용은 잠금을 해제해야 볼 수 있습니다.
            </p>
            <button
              onClick={() => void requestUnlock()}
              data-testid="files-vault-unlock-button"
              className="mt-4 rounded bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-white"
            >
              잠금해제
            </button>
          </div>
        ) : (
          <FilesList
            nodes={data?.nodes ?? []}
            trash={trash}
            vaultRootId={vaultCtx.vaultRootId}
            ensureUnlocked={e2eUi.requestUnlock}
            unlocked={e2eUi.unlocked}
            canWrite={vaultCtx.canWrite}
          />
        )}
      </section>
      </div>

      {e2eUi.open && (
        <E2EUnlockModal onUnlocked={e2eUi.onUnlocked} onClose={e2eUi.onCancel} />
      )}
    </div>
  )
}
