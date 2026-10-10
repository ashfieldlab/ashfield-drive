"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { LayoutGrid, List, Lock, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FilesBreadcrumb } from "@/components/files/files-breadcrumb"
import { FilesList, type FilesView } from "@/components/files/files-list"
import { FilesNewMenu } from "@/components/files/files-toolbar"
import { StorageUsage } from "@/components/files/storage-usage"
import { TrashView } from "@/components/files/trash-view"
import { E2EUnlockModal } from "@/components/files/e2e-unlock-modal"
import { useAppContext } from "@/components/providers/app-context"
import { useToast } from "@/components/ui-custom/use-toast"
import { useConfirm } from "@/components/ui-custom/use-confirm"
import { invalidateApi, useApiGet } from "@/lib/hooks/use-api"
import { useE2E } from "@/lib/e2e/use-e2e"
import { useVaultContext } from "@/lib/e2e/use-vault-context"
import type { VaultOut } from "@/lib/e2e/api"
import * as e2e from "@/lib/e2e/session"
import { readDataTransfer, type DropBatch } from "@/lib/uploads/drop"
import { destKeyOf, enqueueBatch, type UploadDest } from "@/lib/uploads/store"
import { cn } from "@/lib/utils"
import type { AncestorsResponse, NodeScope, TeamFolderItem, TrashResponse, TreeResponse } from "@/lib/types/api"

const VIEWS: { key: FilesView; label: string; icon: typeof List }[] = [
  { key: "list", label: "목록", icon: List },
  { key: "grid", label: "갤러리", icon: LayoutGrid },
]
const VIEW_KEY = "files:layout"

export default function FilesPage() {
  const { toast } = useToast()
  const confirm = useConfirm()
  const { activeWorkspaceId } = useAppContext()
  const sp = useSearchParams()
  const trash = sp.get("trash") === "1"
  const sharedWithMe = sp.get("view") === "shared-with-me"
  const scopeParam = sp.get("scope")
  const scope: NodeScope = scopeParam === "shared" ? "shared" : "personal"
  const folderId = sp.get("folder")
  // 부서 폴더 메뉴를 통해 진입했는지: 빵부스러기/사이드바를 "부서 폴더"로 표기.
  const fromTeam = sp.get("from") === "team-folders"

  // 목록/갤러리 (브라우저별 기억)
  const [view, setView] = useState<FilesView>("list")
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY)
      if (v === "list" || v === "grid") setView(v)
    } catch {
      // 무시: 기본 목록
    }
  }, [])
  function chooseView(v: FilesView) {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // 무시
    }
  }

  // ActiveWorkspaceGate 가 activeWorkspaceId ready 보장. race 차단 layout 차원.
  const apiPath = trash
    ? "/api/v1/nodes/trash"
    : sharedWithMe
      ? "/api/v1/nodes/shared-with-me"
      : `/api/v1/nodes/tree?scope=${scope}${folderId ? `&parent_id=${folderId}` : ""}`

  // 휴지통이면 TrashResponse (retention_days 포함)
  const { data, error, isLoading } = useApiGet<TreeResponse & Partial<TrashResponse>>(apiPath)

  // E2E vault (ADR-0016)
  const e2eUi = useE2E()
  const { requestUnlock, unlocked: e2eUnlocked } = e2eUi
  const vaultCtx = useVaultContext(trash || sharedWithMe ? null : folderId)
  const { data: vaults } = useApiGet<VaultOut[]>(trash ? null : "/api/v1/e2e/vaults")
  const vaultIds = useMemo(() => new Set((vaults ?? []).map((v) => v.node_id)), [vaults])
  const isEmptyFolder = !!folderId && (data?.nodes.length ?? 0) === 0
  // 현재 폴더가 팀(부서) 폴더 루트인지: 팀 폴더는 vault 전환 불가(가드), 버튼 숨김.
  const { data: teamFolders } = useApiGet<TeamFolderItem[]>(
    scope === "shared" && !trash && !sharedWithMe ? "/api/v1/team-folders" : null,
  )
  const teamFolderIds = useMemo(() => new Set((teamFolders ?? []).map((t) => t.node_id)), [teamFolders])
  const isTeamFolder = !!folderId && teamFolderIds.has(folderId)
  const showMakeVault =
    !trash && !sharedWithMe && !!folderId && vaultCtx.canMakeVault && isEmptyFolder && !isTeamFolder
  // 비멤버가 들어온 보안 폴더: 업로드/액션 막고 명시적으로 안내.
  const vaultNoAccess = vaultCtx.vaultRootId !== null && !vaultCtx.hasAccess
  // 멤버지만 아직 잠금해제 안 함: 목록 자체를 숨김 (개수, 크기, 수정일, 종류 노출 방지).
  const vaultLocked = vaultCtx.vaultRootId !== null && vaultCtx.hasAccess && !e2eUnlocked
  const canUpload = !trash && !sharedWithMe && !vaultNoAccess && vaultCtx.canWrite

  // 업로드 목적지: 큐가 화면을 떠나도 돌아올 수 있게 이름과 주소를 같이 넣는다.
  const { data: anc } = useApiGet<AncestorsResponse>(folderId && !trash && !sharedWithMe ? `/api/v1/nodes/${folderId}/ancestors` : null)
  const rootLabel = fromTeam ? "부서 폴더" : scope === "personal" ? "내 파일" : "워크스페이스"
  const destKey = canUpload ? destKeyOf({ workspaceId: activeWorkspaceId, scope, parentId: folderId }) : null

  async function upload(batch: DropBatch) {
    if (!canUpload) return
    if (batch.files.length === 0 && batch.folders.length === 0) return
    try {
      if (vaultCtx.vaultRootId) await e2eUi.requestUnlock()
      let label = rootLabel
      const leaf = anc?.ancestors[anc.ancestors.length - 1]
      if (folderId && leaf) {
        const inVaultDesc = vaultCtx.vaultRootId !== null && folderId !== vaultCtx.vaultRootId
        label = inVaultDesc ? await e2e.decryptName(vaultCtx.vaultRootId!, leaf.name).catch(() => "보안 폴더") : leaf.name
      }
      const dest: UploadDest = {
        workspaceId: activeWorkspaceId,
        scope,
        parentId: folderId,
        vaultRootId: vaultCtx.vaultRootId,
        label,
        href: `/files?scope=${scope}${folderId ? `&folder=${folderId}` : ""}${fromTeam ? "&from=team-folders" : ""}`,
      }
      enqueueBatch(batch, dest)
    } catch (e) {
      toast.error(`업로드 실패: ${(e as Error).message}`)
    }
  }

  // 드래그앤드롭 업로드: 업로드할 수 있는 화면에서만.
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
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
  async function onDrop(e: React.DragEvent) {
    if (!canUpload || !hasFiles(e.dataTransfer)) return
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    await upload(await readDataTransfer(e.dataTransfer))
  }

  // vault 진입 시 잠금 상태면 자동으로 잠금해제 모달 (파일명과 내용 복호화 위해).
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

  const errorBox = (
    <div
      className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
      data-testid="files-error"
    >
      불러오지 못했습니다. 잠시 후 다시 시도해주세요.
    </div>
  )
  const loadingBox = <div className="text-sm text-muted-foreground">불러오는 중…</div>

  return (
    <div
      className="relative h-full"
      data-testid="files-page"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => void onDrop(e)}
    >
      {/* 스크롤은 이 안에서만 */}
      <div className={cn("h-full overflow-y-auto px-4 py-6 sm:px-6 lg:px-8", dragging && "bg-primary/[0.02]")}>
        {trash ? (
          error ? errorBox : isLoading ? loadingBox : <TrashView nodes={data?.nodes ?? []} retentionDays={data?.retention_days ?? 30} />
        ) : (
          <section className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex min-w-0 items-center gap-2">
                {sharedWithMe ? (
                  <h1 className="text-xl font-semibold tracking-tight text-foreground">공유받은 항목</h1>
                ) : (
                  <FilesBreadcrumb scope={scope} folderId={folderId} unlocked={e2eUnlocked} teamFolder={fromTeam} />
                )}
                {/* 보안 폴더 배지: 권한과 무관하게 항상 표시 (읽기전용도) */}
                {vaultCtx.vaultRootId && !vaultNoAccess && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    data-testid="files-vault-badge"
                  >
                    <Lock className="size-3" />
                    보안 폴더{!vaultCtx.canWrite && ", 읽기 전용"}
                  </span>
                )}
                {isTeamFolder && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                    data-testid="files-team-folder-badge"
                  >
                    <Users className="size-3" />
                    부서 폴더
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {showMakeVault && canUpload && (
                  <Button
                    variant="outline"
                    data-testid="files-make-vault-button"
                    onClick={handleMakeVault}
                    className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-200"
                  >
                    <Lock />
                    보안 폴더로 전환
                  </Button>
                )}
                {vaultCtx.vaultRootId && e2eUnlocked && (
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="files-vault-lock-button"
                    onClick={e2eUi.lock}
                    className="text-muted-foreground"
                  >
                    <Lock />
                    잠그기
                  </Button>
                )}
                <div className="flex items-center rounded-lg border p-0.5" role="radiogroup" aria-label="보기">
                  {VIEWS.map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={view === key}
                      aria-label={label}
                      title={label}
                      data-testid={`files-view-${key}`}
                      onClick={() => chooseView(key)}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-md transition-colors",
                        view === key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                    </button>
                  ))}
                </div>
                {canUpload && (
                  <FilesNewMenu
                    scope={scope}
                    parentId={folderId}
                    vaultRootId={vaultCtx.vaultRootId}
                    ensureUnlocked={e2eUi.requestUnlock}
                    onUpload={(b) => void upload(b)}
                  />
                )}
              </div>
            </div>

            {error ? (
              errorBox
            ) : isLoading ? (
              loadingBox
            ) : vaultNoAccess ? (
              <div
                className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-900/60 dark:bg-amber-950/40"
                data-testid="files-vault-no-access"
              >
                <Lock className="mx-auto size-7 text-amber-700 dark:text-amber-300" />
                <p className="mt-3 text-sm font-semibold text-amber-900 dark:text-amber-200">
                  이 보안 폴더에 접근 권한이 없습니다
                </p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-200">
                  내용을 보거나 파일을 올리려면 폴더 소유자에게 공유를 요청하세요.
                </p>
              </div>
            ) : vaultLocked ? (
              <div
                className="flex flex-col items-center gap-3 rounded-xl border bg-card py-16 text-center"
                data-testid="files-vault-locked"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                  <Lock className="size-5" />
                </span>
                <p className="text-sm font-semibold text-foreground">잠긴 보안 폴더</p>
                <Button onClick={() => void requestUnlock()} data-testid="files-vault-unlock-button">
                  잠금 해제
                </Button>
              </div>
            ) : (
              <FilesList
                nodes={data?.nodes ?? []}
                view={view}
                vaultRootId={vaultCtx.vaultRootId}
                ensureUnlocked={e2eUi.requestUnlock}
                unlocked={e2eUi.unlocked}
                canWrite={vaultCtx.canWrite}
                destKey={destKey}
                dragging={dragging}
                dropLabel={
                  folderId
                    ? (anc?.ancestors[anc.ancestors.length - 1] && !vaultCtx.vaultRootId
                        ? anc.ancestors[anc.ancestors.length - 1].name
                        : "이 폴더")
                    : rootLabel
                }
                vaultIds={vaultIds}
                teamFolderIds={teamFolderIds}
                emptyLabel={sharedWithMe ? "공유받은 항목 없음" : undefined}
                toolbarExtra={!sharedWithMe && !vaultCtx.vaultRootId ? <StorageUsage /> : undefined}
              />
            )}
          </section>
        )}
      </div>

      {e2eUi.open && <E2EUnlockModal onUnlocked={e2eUi.onUnlocked} onClose={e2eUi.onCancel} />}
    </div>
  )
}
