"use client"

import { use, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, ShieldCheck, User } from "lucide-react"
import { useToast } from "@/components/ui-custom/use-toast"

import { useAppContext } from "@/components/providers/app-context"
import { QuotaCard } from "@/components/quota/quota-card"
import { api } from "@/lib/api-client"
import { invalidateApi, useApiGet } from "@/lib/hooks/use-api"

type WorkspaceRole = "admin" | "member"

interface MemberItem {
  user_sub: string
  email: string | null
  name: string | null
  role: WorkspaceRole
}

interface MemberListResponse {
  members: MemberItem[]
}

export default function WorkspaceMembersPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: workspaceIdRaw } = use(params)
  const workspaceId = decodeURIComponent(workspaceIdRaw)
  const { isSystemAdmin } = useAppContext()
  const { toast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  const url = isSystemAdmin
    ? `/api/v1/admin/workspaces/${encodeURIComponent(workspaceId)}/members`
    : null
  const { data, error, isLoading } = useApiGet<MemberListResponse>(url)

  if (!isSystemAdmin) {
    return (
      <div
        className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-6 text-sm text-amber-800 dark:text-amber-200"
        data-testid="workspace-members-no-permission"
      >
        시스템 관리자만 접근할 수 있습니다.
      </div>
    )
  }

  const adminCount =
    data?.members.filter((m) => m.role === "admin").length ?? 0

  async function setRole(member: MemberItem, role: WorkspaceRole) {
    setBusy(member.user_sub)
    try {
      await api(
        `/api/v1/admin/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(member.user_sub)}`,
        { method: "PATCH", body: { role } },
      )
      toast.success(
        role === "admin"
          ? `${member.name ?? member.user_sub} 님을 관리자로 임명했습니다`
          : `${member.name ?? member.user_sub} 님을 멤버로 변경했습니다`,
      )
      invalidateApi(url!)
      invalidateApi("/api/v1/admin/workspaces")
    } catch (e) {
      toast.error(`변경 실패: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="h-full overflow-y-auto space-y-4 px-4 py-8 sm:px-6 lg:px-8"
      data-testid="workspace-members-page"
    >
      <Link
        href="/admin/workspaces"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        data-testid="workspace-members-back"
      >
        <ArrowLeft size={12} /> 워크스페이스 목록
      </Link>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">
          {workspaceId} 멤버 관리
        </h1>
      </header>

      <QuotaCard workspaceId={workspaceId} mode="admin" />

      {adminCount === 0 && data && (
        <div
          className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-4 py-2 text-sm text-amber-800 dark:text-amber-200"
          data-testid="workspace-members-no-admin-warning"
        >
          <AlertTriangle size={14} />
          이 워크스페이스에는 관리자가 없습니다. 한 명을 임명해주세요.
        </div>
      )}

      {error ? (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-700 dark:text-rose-300">
          불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      ) : isLoading ? (
        <div className="text-sm text-muted-foreground">불러오는 중…</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm" data-testid="workspace-members-list">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">이름</th>
                <th className="px-4 py-2 font-medium">이메일</th>
                <th className="w-32 px-4 py-2 font-medium">역할</th>
                <th className="w-32 px-4 py-2 text-right font-medium">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {data?.members.map((m) => {
                const isAdmin = m.role === "admin"
                return (
                  <tr
                    key={m.user_sub}
                    data-testid={`workspace-members-row-${m.user_sub}`}
                    className="hover:bg-muted/50"
                  >
                    <td className="px-4 py-2 text-foreground">
                      {m.name ?? m.user_sub}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{m.email ?? "-"}</td>
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
                      {isAdmin ? (
                        <button
                          onClick={() => setRole(m, "member")}
                          disabled={busy === m.user_sub}
                          data-testid={`workspace-members-row-${m.user_sub}-demote`}
                          className="rounded border border-input px-2 py-1 text-xs text-foreground/80 hover:bg-muted disabled:opacity-50"
                        >
                          강등
                        </button>
                      ) : (
                        <button
                          onClick={() => setRole(m, "admin")}
                          disabled={busy === m.user_sub}
                          data-testid={`workspace-members-row-${m.user_sub}-promote`}
                          className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          관리자 임명
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {data?.members.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    아직 이 워크스페이스로 로그인한 사용자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
