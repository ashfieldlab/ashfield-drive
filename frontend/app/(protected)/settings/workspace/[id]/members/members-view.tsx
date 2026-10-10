"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, ExternalLink, ShieldCheck, User } from "lucide-react"
import { useToast } from "@/components/ui-custom/use-toast"

import { useAppContext } from "@/components/providers/app-context"
import { QuotaCard } from "@/components/quota/quota-card"
import { api } from "@/lib/api-client"
import { invalidateApi, useApiGet } from "@/lib/hooks/use-api"
import { formatBytes } from "@/lib/utils/format"

type WorkspaceRole = "admin" | "member"

const GB = 1024 ** 3

interface MemberItem {
  user_sub: string
  email: string | null
  name: string | null
  role: WorkspaceRole
  storage_bytes_used: number
  storage_bytes_limit: number | null
}

interface MemberListResponse {
  /** 계정 서버 워크스페이스 ID. null = 계정 서버 도입 전의 로컬 워크스페이스. */
  account_workspace_id: string | null
  members: MemberItem[]
}

/**
 * 워크스페이스 멤버 조회 + 저장 한도(앱 고유 설정). 추가, 제거, 역할 변경은 Ashfield 계정
 * 서버에서 하고, 바뀐 소속은 다음 토큰 갱신(최대 15분) 또는 재로그인 때 이 앱에 반영된다.
 */
export default function WorkspaceMembersView({
  workspaceId,
  accountURL,
}: {
  workspaceId: string
  accountURL: string
}) {
  const { isWorkspaceAdmin, workspaceNames } = useAppContext()
  const { toast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  // 한도 설정 모달: 대상 멤버 + GB 입력(빈값 = 무제한).
  const [quotaFor, setQuotaFor] = useState<MemberItem | null>(null)
  const [quotaGb, setQuotaGb] = useState("")

  const url = isWorkspaceAdmin
    ? `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/members`
    : null
  const { data, error, isLoading } = useApiGet<MemberListResponse>(url)

  if (!isWorkspaceAdmin) {
    return (
      <div
        className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-6 text-sm text-amber-800 dark:text-amber-200"
        data-testid="workspace-members-settings-no-permission"
      >
        워크스페이스 관리자만 접근할 수 있습니다.
      </div>
    )
  }

  const accountWorkspaceId = data?.account_workspace_id ?? null
  const manageUrl = accountWorkspaceId
    ? `${accountURL}/workspaces/${encodeURIComponent(accountWorkspaceId)}`
    : null

  function openQuota(m: MemberItem) {
    setQuotaFor(m)
    setQuotaGb(
      m.storage_bytes_limit != null
        ? String(+(m.storage_bytes_limit / GB).toFixed(2))
        : "",
    )
  }

  async function saveQuota() {
    if (!quotaFor) return
    const trimmed = quotaGb.trim()
    const limit = trimmed === "" ? null : Math.round(parseFloat(trimmed) * GB)
    if (limit != null && (isNaN(limit) || limit < 0)) {
      toast.error("올바른 용량(GB)을 입력하세요")
      return
    }
    setBusy(quotaFor.user_sub)
    try {
      await api(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(quotaFor.user_sub)}/quota`,
        { method: "PUT", body: { storage_bytes_limit: limit } },
      )
      toast.success(
        limit == null ? "한도를 무제한으로 설정했습니다" : "저장 한도를 설정했습니다",
      )
      invalidateApi(url!)
      setQuotaFor(null)
    } catch (e) {
      toast.error(`설정 실패: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="h-full overflow-y-auto space-y-4 px-4 py-8 sm:px-6 lg:px-8"
      data-testid="workspace-members-settings-page"
    >
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        data-testid="workspace-members-settings-back"
      >
        <ArrowLeft size={12} /> 설정으로
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">
          {workspaceNames[workspaceId] ?? workspaceId} 멤버
        </h1>
        {manageUrl && (
          <a
            href={manageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            data-testid="workspace-members-manage-link"
          >
            Ashfield 계정에서 관리
            <ExternalLink size={14} aria-hidden />
          </a>
        )}
      </header>

      {data && !manageUrl && (
        <div
          className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground"
          data-testid="workspace-members-settings-account-notice"
        >
          이 워크스페이스는 멤버를 변경할 수 없습니다.
        </div>
      )}

      <QuotaCard workspaceId={workspaceId} mode="view" />

      {error ? (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-700 dark:text-rose-300">
          불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      ) : isLoading ? (
        <div className="text-sm text-muted-foreground">불러오는 중…</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table
            className="w-full text-sm"
            data-testid="workspace-members-settings-list"
          >
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">이름</th>
                <th className="px-4 py-2 font-medium">이메일</th>
                <th className="w-48 px-4 py-2 font-medium">저장 사용량</th>
                <th className="w-32 px-4 py-2 font-medium">역할</th>
                <th className="w-24 px-4 py-2 text-right font-medium">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {data?.members.map((m) => {
                const isAdmin = m.role === "admin"
                return (
                  <tr
                    key={m.user_sub}
                    data-testid={`workspace-members-settings-row-${m.user_sub}`}
                    className="hover:bg-muted/50"
                  >
                    <td className="px-4 py-2 text-foreground">
                      {m.name ?? m.user_sub}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {m.email ?? "-"}
                    </td>
                    <td className="px-4 py-2">
                      <MemberStorage
                        used={m.storage_bytes_used}
                        limit={m.storage_bytes_limit}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
                          isAdmin
                            ? "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300"
                            : "bg-muted text-foreground/80"
                        }`}
                      >
                        {isAdmin ? (
                          <ShieldCheck size={12} />
                        ) : (
                          <User size={12} />
                        )}
                        {isAdmin ? "관리자" : "멤버"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => openQuota(m)}
                          disabled={busy === m.user_sub}
                          data-testid={`workspace-members-settings-row-${m.user_sub}-quota`}
                          className="rounded border border-input px-2 py-1 text-xs text-foreground/80 hover:bg-muted disabled:opacity-50"
                        >
                          한도
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {quotaFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => busy === null && setQuotaFor(null)}
        >
          <div
            className="w-80 space-y-3 rounded-lg bg-card p-5 shadow-lg dark:ring-1 dark:ring-foreground/10"
            onClick={(e) => e.stopPropagation()}
            data-testid="workspace-members-quota-modal"
          >
            <h3 className="text-base font-semibold text-foreground">저장 한도</h3>
            <p className="text-xs text-muted-foreground">
              {quotaFor.name ?? quotaFor.user_sub}, 현재 사용{" "}
              {formatBytes(quotaFor.storage_bytes_used)}
            </p>
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="number"
                min={0}
                step="0.5"
                value={quotaGb}
                onChange={(e) => setQuotaGb(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveQuota()
                  if (e.key === "Escape") setQuotaFor(null)
                }}
                placeholder="비우면 무제한"
                data-testid="workspace-members-quota-input"
                className="w-full rounded border border-input px-3 py-2 text-sm focus:border-ring focus:outline-none"
              />
              <span className="text-sm text-muted-foreground">GB</span>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setQuotaFor(null)}
                data-testid="workspace-members-quota-cancel"
                className="rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              >
                취소
              </button>
              <button
                onClick={saveQuota}
                disabled={busy === quotaFor.user_sub}
                data-testid="workspace-members-quota-save"
                className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MemberStorage({
  used,
  limit,
}: {
  used: number
  limit: number | null
}) {
  if (limit == null) {
    return (
      <span className="text-xs text-muted-foreground">
        {formatBytes(used)} <span className="text-muted-foreground/70">/ 무제한</span>
      </span>
    )
  }
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 100
  const over = used > limit
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">
        {formatBytes(used)}{" "}
        <span className="text-muted-foreground/70">/ {formatBytes(limit)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${over ? "bg-rose-500" : pct > 85 ? "bg-amber-500" : "bg-foreground/80"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
