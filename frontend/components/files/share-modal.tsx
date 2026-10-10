"use client"

import { useEffect, useState } from "react"
import { File, Folder, Loader2, Lock, X } from "lucide-react"

import { api } from "@/lib/api-client"
import { useApiGet, invalidateApi } from "@/lib/hooks/use-api"
import { formatBytes } from "@/lib/utils/format"
import { logger } from "@/lib/utils/logger"
import { useAppContext } from "@/components/providers/app-context"
import { useToast } from "@/components/ui-custom/use-toast"
import { useConfirm } from "@/components/ui-custom/use-confirm"
import * as e2e from "@/lib/e2e/session"
import { useVaultContext } from "@/lib/e2e/use-vault-context"
import { E2EUnlockModal } from "@/components/files/e2e-unlock-modal"
import { ShareLinkPanel } from "@/components/files/share-link-panel"
import { SharePersonInput } from "@/components/files/share-person-input"
import { Avatar, PermMenu } from "@/components/files/share-parts"
import type {
  FileShareList,
  FileShareResponse,
  NodeResponse,
  SharePermission,
  WorkspaceMember,
} from "@/lib/types/api"

interface Props {
  node: NodeResponse
  // 표시용 이름: vault 파일은 복호화본. 없으면 node.name(원본/암호문).
  displayName?: string
  onClose: () => void
}

// 백엔드 응답에는 그룹(부서) 공유 필드도 있다 (팀 폴더). 개인 공유면 grantee_sub, 그룹이면 grantee_group_id.
type ShareRow = Omit<FileShareResponse, "grantee_sub"> & {
  grantee_sub: string | null
  grantee_group_id?: string | null
  group_name?: string | null
}

const shareLabel = (s: ShareRow) =>
  s.grantee_group_id
    ? (s.group_name ?? "부서")
    : (s.grantee_name ?? s.grantee_email ?? s.grantee_sub ?? "")

/** 공유: 왼쪽 사람(사용자 공유), 오른쪽 외부 링크 */
export function ShareModal({ node, displayName, onClose }: Props) {
  const [showUnlock, setShowUnlock] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // 다른 레이어(확인창, 드롭다운, 잠금해제)가 열려 있으면 그쪽이 먼저 닫힌다.
      if (e.key !== "Escape" || showUnlock) return
      if (document.querySelector("[role=alertdialog], [role=menu]")) return
      onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, showUnlock])

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
        onClick={onClose}
      >
        <div
          className="flex max-h-[92vh] w-[720px] max-w-full flex-col overflow-y-auto rounded-xl border bg-background shadow-2xl md:h-[480px] md:flex-row md:overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={`${displayName ?? node.name} 공유`}
          data-testid="share-modal"
        >
          <PeoplePane
            node={node}
            displayName={displayName ?? node.name}
            retry={retry}
            onNeedUnlock={() => setShowUnlock(true)}
          />
          <ShareLinkPanel node={node} onClose={onClose} />
        </div>
      </div>
      {showUnlock && (
        <E2EUnlockModal
          onUnlocked={() => {
            setShowUnlock(false)
            setRetry((n) => n + 1) // 잠금해제 완료 → 공유 자동 재시도
          }}
          onClose={() => setShowUnlock(false)}
        />
      )}
    </>
  )
}

function PeoplePane({
  node,
  displayName,
  retry,
  onNeedUnlock,
}: {
  node: NodeResponse
  displayName: string
  retry: number
  onNeedUnlock: () => void
}) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const { authUser } = useAppContext()
  const { data, isLoading, mutate } = useApiGet<FileShareList>(`/api/v1/nodes/${node.id}/shares`)
  // 이 노드가 속한 vault: 공유 시 vault_key 도 함께 전달해야 함.
  const { vaultRootId } = useVaultContext(node.id)
  const [staged, setStaged] = useState<WorkspaceMember[]>([])
  const [permission, setPermission] = useState<SharePermission>("read")
  const [busy, setBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)

  const shares = (data?.shares ?? []) as ShareRow[]
  const isOwner = !!authUser && authUser.id === node.owner_id
  const stack = [
    ...(isOwner && authUser ? [{ key: authUser.id, label: authUser.name ?? authUser.email, group: false }] : []),
    ...shares.map((s) => ({ key: s.grantee_group_id ?? s.grantee_sub ?? s.id, label: shareLabel(s), group: !!s.grantee_group_id })),
  ]

  async function addShares() {
    if (staged.length === 0 || busy) return
    setBusy(true)
    const done: string[] = []
    try {
      for (const m of staged) {
        // 보안 폴더면 ACL 공유에 더해 vault 멤버십(상대 공개키로 vault_key wrap)도 등록.
        // 키 전달이 실패하면 ACL 도 만들지 않음: "접근 권한 있는데 복호화 불가" 모순 방지.
        if (vaultRootId) {
          if (!e2e.isUnlocked()) {
            // 잠금해제 모달을 띄우고, 풀리면 공유를 자동 재시도.
            onNeedUnlock()
            return
          }
          try {
            await e2e.shareVault(vaultRootId, m.sub)
          } catch (err) {
            const status = (err as { status?: number }).status
            if (status === 404) {
              toast.error(`${m.name ?? m.email}: 상대가 아직 보안 폴더를 설정하지 않아 공유할 수 없습니다.`)
            } else {
              toast.error(`보안 폴더 키 전달 실패: ${(err as Error).message}`)
            }
            continue
          }
        }
        try {
          await api(`/api/v1/nodes/${node.id}/shares`, {
            method: "POST",
            body: { grantee_sub: m.sub, permission },
          })
          done.push(m.sub)
        } catch (e) {
          toast.error(`공유 실패: ${(e as Error).message}`)
        }
      }
      if (done.length > 0) {
        toast.success("공유했습니다")
        invalidateApi("/api/v1/nodes")
      }
    } finally {
      setStaged((prev) => prev.filter((m) => !done.includes(m.sub)))
      setBusy(false)
      void mutate()
    }
  }

  // 잠금해제 후 자동 재시도
  useEffect(() => {
    if (retry > 0) void addShares()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retry])

  async function changePermission(s: ShareRow, p: SharePermission) {
    if (p === s.permission) return
    setRowBusy(s.id)
    try {
      // 공유 생성은 upsert: 같은 대상에 다시 보내면 권한이 바뀐다.
      await api(`/api/v1/nodes/${node.id}/shares`, {
        method: "POST",
        body: s.grantee_group_id
          ? { grantee_group_id: s.grantee_group_id, permission: p, expires_at: s.expires_at }
          : { grantee_sub: s.grantee_sub, permission: p, expires_at: s.expires_at },
      })
      void mutate()
    } catch (e) {
      toast.error(`권한 변경 실패: ${(e as Error).message}`)
    } finally {
      setRowBusy(null)
    }
  }

  async function removeShare(s: ShareRow) {
    const ok = await confirm({
      title: "공유 해제",
      description: `'${shareLabel(s)}' 의 공유를 해제하시겠습니까?`,
      confirmText: "해제",
      variant: "destructive",
    })
    if (!ok) return
    setRowBusy(s.id)
    try {
      await api(`/api/v1/nodes/${node.id}/shares/${s.id}`, { method: "DELETE" })
      // 보안 폴더면 vault 멤버십(키)도 회수: best-effort.
      if (vaultRootId && s.grantee_sub) {
        try {
          await e2e.unshareVault(vaultRootId, s.grantee_sub)
        } catch (err) {
          logger.warn("vault_unshare_failed", { category: "biz", vaultRootId, error: String(err) })
        }
      }
      toast.success("공유를 해제했습니다")
      void mutate()
      invalidateApi("/api/v1/nodes")
    } catch (e) {
      toast.error(`해제 실패: ${(e as Error).message}`)
    } finally {
      setRowBusy(null)
    }
  }

  const meta =
    node.kind === "folder" ? "폴더" : node.size_bytes != null ? formatBytes(node.size_bytes) : "파일"

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-2.5 px-5 pt-4 pb-3">
        {node.kind === "folder" ? (
          <Folder size={18} className="shrink-0 text-amber-600 dark:text-amber-400" />
        ) : (
          <File size={18} className="shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] leading-tight font-semibold" data-testid="share-modal-title">
            {displayName}
          </h2>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            {vaultRootId && <Lock size={11} className="shrink-0 text-amber-600 dark:text-amber-400" />}
            {vaultRootId ? `보안 폴더, ${meta}` : meta}
          </p>
        </div>
        <div className="flex -space-x-1.5" data-testid="share-avatar-stack">
          {stack.slice(0, 4).map((p) => (
            <Avatar key={p.key} seed={p.key} label={p.label} group={p.group} size={24} className="ring-2 ring-background" />
          ))}
          {stack.length > 4 && (
            <span className="grid size-6 place-items-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-background">
              +{stack.length - 4}
            </span>
          )}
        </div>
      </header>

      <div className="px-5">
        <SharePersonInput
          staged={staged}
          exclude={[
            ...(authUser ? [authUser.id] : []),
            node.owner_id,
            ...shares.map((s) => s.grantee_sub).filter((x): x is string => !!x),
          ]}
          onStage={(m) => setStaged((prev) => (prev.some((p) => p.sub === m.sub) ? prev : [...prev, m]))}
          onUnstage={(sub) => setStaged((prev) => prev.filter((p) => p.sub !== sub))}
          onSubmit={() => void addShares()}
          disabled={busy}
        />
        <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
          추가 권한
          <PermMenu
            value={permission}
            onChange={setPermission}
            testId="share-permission"
            align="start"
            className="h-6 px-1.5 text-xs font-medium text-foreground"
          />
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void addShares()}
            disabled={busy || staged.length === 0}
            data-testid="share-add-button"
            className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            공유
          </button>
        </div>
      </div>

      <ul className="mt-2 min-h-0 flex-1 overflow-y-auto px-3 pb-3" data-testid="share-list">
        {isOwner && authUser && (
          <li className="flex items-center gap-2.5 rounded-lg px-2 py-1.5" data-testid="share-owner-row">
            <Avatar seed={authUser.id} label={authUser.name ?? authUser.email} size={28} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">
                {authUser.name ?? authUser.email} <span className="text-muted-foreground">(나)</span>
              </div>
              {authUser.name && <div className="truncate text-[11px] text-muted-foreground">{authUser.email}</div>}
            </div>
            <span className="px-2 text-xs text-muted-foreground">소유자</span>
          </li>
        )}
        {isLoading && (
          <li className="flex justify-center py-6 text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
          </li>
        )}
        {shares.map((s) => (
          <li
            key={s.id}
            data-testid={`share-row-${s.id}`}
            className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/60"
          >
            <Avatar
              seed={s.grantee_group_id ?? s.grantee_sub ?? s.id}
              label={shareLabel(s)}
              group={!!s.grantee_group_id}
              size={28}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{shareLabel(s)}</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {s.grantee_group_id ? "부서" : s.grantee_name ? s.grantee_email : ""}
              </div>
            </div>
            {rowBusy === s.id && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
            <PermMenu
              value={s.permission}
              onChange={(p) => void changePermission(s, p)}
              disabled={rowBusy === s.id}
              testId={`share-row-${s.id}-perm`}
              className="h-7 text-xs"
            />
            <button
              type="button"
              onClick={() => void removeShare(s)}
              disabled={rowBusy === s.id}
              data-testid={`share-row-${s.id}-remove`}
              aria-label="해제"
              title="해제"
              className="grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background hover:text-rose-600 focus-visible:opacity-100 dark:hover:text-rose-400 [@media(hover:none)]:opacity-100"
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
