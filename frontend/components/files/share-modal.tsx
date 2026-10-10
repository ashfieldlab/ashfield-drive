"use client"

import { useState } from "react"
import { Copy, Trash2, X } from "lucide-react"

import { api } from "@/lib/api-client"
import { useApiGet, invalidateApi } from "@/lib/hooks/use-api"
import { useToast } from "@/components/ui-custom/use-toast"
import { UserAutocomplete } from "@/components/ui-custom/user-autocomplete"
import { formatDateTime } from "@/lib/utils/format"
import * as e2e from "@/lib/e2e/session"
import { useVaultContext } from "@/lib/e2e/use-vault-context"
import { E2EUnlockModal } from "@/components/files/e2e-unlock-modal"
import { useConfirm } from "@/components/ui-custom/use-confirm"
import type {
  ExternalLinkList,
  ExternalLinkResponse,
  FileShareList,
  FileShareResponse,
  NodeResponse,
  SharePermission,
} from "@/lib/types/api"

interface Props {
  node: NodeResponse
  // 표시용 이름: vault 파일은 복호화본. 없으면 node.name(원본/암호문).
  displayName?: string
  onClose: () => void
}

type Tab = "users" | "links"

export function ShareModal({ node, displayName, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("users")

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-[92vw] rounded-lg bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
        data-testid="share-modal"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="min-w-0 truncate text-base font-semibold text-gray-900">
            {displayName ?? node.name} 공유
          </h3>
          <button
            onClick={onClose}
            data-testid="share-modal-close"
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-gray-200 px-5">
          <nav className="-mb-px flex gap-4">
            <TabButton
              active={tab === "users"}
              onClick={() => setTab("users")}
              label="사용자"
              testId="share-tab-users"
            />
            <TabButton
              active={tab === "links"}
              onClick={() => setTab("links")}
              label="외부 링크"
              testId="share-tab-links"
            />
          </nav>
        </div>

        <div className="p-5">
          {tab === "users" ? (
            <UsersTab node={node} />
          ) : (
            <LinksTab node={node} />
          )}
        </div>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
  testId,
}: {
  active: boolean
  onClick: () => void
  label: string
  testId: string
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`border-b-2 px-1 py-2 text-sm font-medium ${
        active
          ? "border-gray-900 text-gray-900"
          : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Users tab: FileShare CRUD
// ---------------------------------------------------------------------------

function UsersTab({ node }: { node: NodeResponse }) {
  const { toast } = useToast()
  const { data, isLoading, mutate } = useApiGet<FileShareList>(
    `/api/v1/nodes/${node.id}/shares`,
  )
  const confirm = useConfirm()
  // 이 노드가 속한 vault: 공유 시 vault_key 도 함께 전달해야 함.
  const { vaultRootId } = useVaultContext(node.id)
  const [granteeSub, setGranteeSub] = useState("")
  const [permission, setPermission] = useState<SharePermission>("read")
  const [busy, setBusy] = useState(false)
  const [showUnlock, setShowUnlock] = useState(false)

  async function addShare() {
    const sub = granteeSub.trim()
    if (!sub) return
    setBusy(true)
    try {
      // 보안 폴더면 ACL 공유에 더해 vault 멤버십(상대 공개키로 vault_key wrap)도 등록.
      // 키 전달이 실패하면 ACL 도 만들지 않음: "접근 권한 있는데 복호화 불가" 모순 방지.
      if (vaultRootId) {
        if (!e2e.isUnlocked()) {
          // 잠금해제 모달을 띄우고, 풀리면 공유를 자동 재시도 (밖에서도 공유 가능).
          setShowUnlock(true)
          return
        }
        try {
          await e2e.shareVault(vaultRootId, sub)
        } catch (err) {
          const status = (err as { status?: number }).status
          if (status === 404) {
            toast.error(
              "상대가 아직 보안 폴더를 설정하지 않아 공유할 수 없습니다.",
            )
          } else {
            toast.error(`보안 폴더 키 전달 실패: ${(err as Error).message}`)
          }
          return
        }
      }
      await api(`/api/v1/nodes/${node.id}/shares`, {
        method: "POST",
        body: { grantee_sub: sub, permission },
      })
      toast.success("공유했습니다")
      setGranteeSub("")
      void mutate()
      invalidateApi("/api/v1/nodes")
    } catch (e) {
      toast.error(`공유 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function removeShare(s: FileShareResponse) {
    const ok = await confirm({
      title: "공유 해제",
      description: `'${s.grantee_name ?? s.grantee_email ?? s.grantee_sub}' 의 공유를 해제하시겠습니까?`,
      confirmText: "해제",
      variant: "destructive",
    })
    if (!ok) return
    try {
      await api(`/api/v1/nodes/${node.id}/shares/${s.id}`, { method: "DELETE" })
      // 보안 폴더면 vault 멤버십(키)도 회수: best-effort.
      if (vaultRootId) {
        try {
          await e2e.unshareVault(vaultRootId, s.grantee_sub)
        } catch (err) {
          console.warn("[share] vault 멤버 제거 실패", err)
        }
      }
      toast.success("공유를 해제했습니다")
      void mutate()
    } catch (e) {
      toast.error(`해제 실패: ${(e as Error).message}`)
    }
  }

  return (
    <div className="space-y-3">
      {vaultRootId && (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          data-testid="share-vault-hint"
        >
          🔒 상대가 <b>보안 폴더를 먼저 설정</b>해 두어야 공유됩니다.
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            사용자
          </label>
          <UserAutocomplete
            value={granteeSub}
            onChange={(sub) => setGranteeSub(sub)}
            testId="share-grantee-input"
          />
        </div>
        <select
          value={permission}
          onChange={(e) => setPermission(e.target.value as SharePermission)}
          data-testid="share-permission-select"
          className="rounded border border-gray-300 px-2 py-2 text-sm"
        >
          <option value="read">읽기</option>
          <option value="write">쓰기</option>
          <option value="manage">관리</option>
        </select>
        <button
          onClick={addShare}
          disabled={busy || !granteeSub.trim()}
          data-testid="share-add-button"
          className="rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          공유
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">불러오는 중…</div>
      ) : (data?.shares ?? []).length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
          아직 공유된 사용자가 없습니다.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded border border-gray-200">
          {data!.shares.map((s) => (
            <li
              key={s.id}
              data-testid={`share-row-${s.id}`}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-gray-900">
                  {s.grantee_name ?? s.grantee_email ?? s.grantee_sub}
                </div>
                <div className="text-xs text-gray-500">
                  {s.permission} · {formatDateTime(s.granted_at)}
                </div>
              </div>
              <button
                onClick={() => removeShare(s)}
                data-testid={`share-row-${s.id}-remove`}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-rose-600"
                title="해제"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showUnlock && (
        <E2EUnlockModal
          onUnlocked={() => {
            setShowUnlock(false)
            void addShare() // 잠금해제 완료 → 공유 자동 재시도
          }}
          onClose={() => setShowUnlock(false)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Links tab: ExternalLink CRUD
// ---------------------------------------------------------------------------

function LinksTab({ node }: { node: NodeResponse }) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const { data, isLoading, mutate } = useApiGet<ExternalLinkList>(
    `/api/v1/nodes/${node.id}/external-links`,
  )
  const [password, setPassword] = useState("")
  const [usePassword, setUsePassword] = useState(false)
  const [permission, setPermission] = useState<"read" | "write">("read")
  const [expiryDays, setExpiryDays] = useState("")
  const [busy, setBusy] = useState(false)

  async function createLink() {
    setBusy(true)
    try {
      await api(`/api/v1/nodes/${node.id}/external-links`, {
        method: "POST",
        body: {
          permission,
          password: usePassword && password ? password : null,
          expires_at: expiryDays
            ? new Date(Date.now() + Number(expiryDays) * 86400000).toISOString()
            : null,
        },
      })
      toast.success("링크를 만들었습니다")
      setPassword("")
      void mutate()
    } catch (e) {
      toast.error(`생성 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function revoke(link: ExternalLinkResponse) {
    if (!(await confirm({ title: "링크 철회", description: "이 외부 링크를 철회하시겠습니까? 기존 URL 이 즉시 무효화됩니다.", confirmText: "철회", variant: "destructive" }))) return
    try {
      await api(`/api/v1/nodes/${node.id}/external-links/${link.id}`, {
        method: "DELETE",
      })
      toast.success("철회했습니다")
      void mutate()
    } catch (e) {
      toast.error(`실패: ${(e as Error).message}`)
    }
  }

  function urlFor(token: string): string {
    if (typeof window === "undefined") return `/s/${token}`
    return `${window.location.origin}/s/${token}`
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded border border-gray-200 p-3">
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-gray-600">
            권한
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value as "read" | "write")}
              data-testid="link-permission-select"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="read">읽기</option>
              <option value="write">쓰기</option>
            </select>
          </label>
          <label className="flex-1 text-xs text-gray-600">
            만료
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              data-testid="link-expiry-select"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">없음</option>
              <option value="1">1일 후</option>
              <option value="7">7일 후</option>
              <option value="30">30일 후</option>
              <option value="90">90일 후</option>
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={usePassword}
            onChange={(e) => setUsePassword(e.target.checked)}
            data-testid="link-password-toggle"
          />
          비밀번호 보호
        </label>
        {usePassword && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="최소 4자"
            minLength={4}
            data-testid="link-password-input"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        )}
        <button
          onClick={createLink}
          disabled={busy || (usePassword && password.length < 4)}
          data-testid="link-create-button"
          className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          새 링크
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">불러오는 중…</div>
      ) : (data?.links ?? []).filter((l) => !l.revoked_at).length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
          아직 활성 링크가 없습니다.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded border border-gray-200">
          {data!.links
            .filter((l) => !l.revoked_at)
            .map((l) => (
              <li
                key={l.id}
                data-testid={`link-row-${l.id}`}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate font-mono text-xs text-gray-700"
                    data-testid={`link-row-${l.id}-url`}
                  >
                    {urlFor(l.token)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {l.has_password ? "🔒 비밀번호 필요 · " : ""}
                    접근 {l.access_count}회
                    {l.expires_at && ` · 만료 ${formatDateTime(l.expires_at)}`}
                  </div>
                </div>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(urlFor(l.token))
                    toast.success("복사했습니다")
                  }}
                  data-testid={`link-row-${l.id}-copy`}
                  className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  title="URL 복사"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={() => revoke(l)}
                  data-testid={`link-row-${l.id}-revoke`}
                  className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-rose-600"
                  title="철회"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
