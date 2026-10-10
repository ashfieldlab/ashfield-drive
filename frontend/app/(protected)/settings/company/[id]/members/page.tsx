"use client"

import { use, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, ShieldCheck, User } from "lucide-react"
import { useToast } from "@/components/ui-custom/use-toast"

import { useAppContext } from "@/components/providers/app-context"
import { QuotaCard } from "@/components/quota/quota-card"
import { useConfirm } from "@/components/ui-custom/use-confirm"
import { ApiError, api } from "@/lib/api-client"
import { invalidateApi, useApiGet } from "@/lib/hooks/use-api"
import { formatBytes } from "@/lib/utils/format"

type CompanyRole = "admin" | "member"

const GB = 1024 ** 3

interface MemberItem {
  user_sub: string
  email: string | null
  name: string | null
  role: CompanyRole
  storage_bytes_used: number
  storage_bytes_limit: number | null
}

interface MemberListResponse {
  members: MemberItem[]
}

export default function CompanyMembersSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: companyIdRaw } = use(params)
  const companyId = decodeURIComponent(companyIdRaw)
  const { isCompanyAdmin, companyNames, authUser } = useAppContext()
  const { toast } = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState("")
  // 한도 설정 모달 — 대상 멤버 + GB 입력(빈값 = 무제한).
  const [quotaFor, setQuotaFor] = useState<MemberItem | null>(null)
  const [quotaGb, setQuotaGb] = useState("")

  const url = isCompanyAdmin
    ? `/api/v1/companies/${encodeURIComponent(companyId)}/members`
    : null
  const { data, error, isLoading } = useApiGet<MemberListResponse>(url)

  if (!isCompanyAdmin) {
    return (
      <div
        className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800"
        data-testid="company-members-settings-no-permission"
      >
        회사 관리자만 접근할 수 있습니다.
      </div>
    )
  }

  const adminCount =
    data?.members.filter((m) => m.role === "admin").length ?? 0

  async function setRole(member: MemberItem, role: CompanyRole) {
    setBusy(member.user_sub)
    try {
      await api(
        `/api/v1/companies/${encodeURIComponent(companyId)}/members/${encodeURIComponent(member.user_sub)}`,
        { method: "PATCH", body: { role } },
      )
      toast.success(
        role === "admin"
          ? `${member.name ?? member.user_sub} 님을 관리자로 임명했습니다`
          : `${member.name ?? member.user_sub} 님을 멤버로 변경했습니다`,
      )
      invalidateApi(url!)
    } catch (e) {
      toast.error(`변경 실패: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

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
        `/api/v1/companies/${encodeURIComponent(companyId)}/members/${encodeURIComponent(quotaFor.user_sub)}/quota`,
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

  async function addMember(e: React.FormEvent) {
    e.preventDefault()
    const email = newEmail.trim()
    if (!email) return
    setBusy("__add__")
    try {
      await api(`/api/v1/companies/${encodeURIComponent(companyId)}/members`, {
        method: "POST",
        body: { email },
      })
      toast.success(`${email} 님을 멤버로 추가했습니다`)
      setNewEmail("")
      invalidateApi(url!)
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 404
          ? "해당 이메일로 로그인한 사용자가 없습니다. 먼저 한 번 로그인해야 합니다."
          : `추가 실패: ${(err as Error).message}`,
      )
    } finally {
      setBusy(null)
    }
  }

  async function removeMember(member: MemberItem) {
    const ok = await confirm({
      title: "멤버 제거",
      description: `${member.name ?? member.email ?? member.user_sub} 님을 이 회사에서 제거할까요?`,
      confirmText: "제거",
      variant: "destructive",
    })
    if (!ok) return
    setBusy(member.user_sub)
    try {
      await api(
        `/api/v1/companies/${encodeURIComponent(companyId)}/members/${encodeURIComponent(member.user_sub)}`,
        { method: "DELETE" },
      )
      toast.success("멤버를 제거했습니다")
      invalidateApi(url!)
    } catch (err) {
      toast.error(`제거 실패: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="h-full overflow-y-auto space-y-4 px-4 py-8 sm:px-6 lg:px-8"
      data-testid="company-members-settings-page"
    >
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
        data-testid="company-members-settings-back"
      >
        <ArrowLeft size={12} /> 설정으로
      </Link>
      <header>
        <h1 className="text-2xl font-bold text-gray-900">
          {companyNames[companyId] ?? companyId} 멤버 관리
        </h1>
      </header>

      <form
        onSubmit={addMember}
        className="flex flex-wrap items-center gap-2"
        data-testid="company-members-add-form"
      >
        <input
          type="email"
          required
          placeholder="추가할 멤버 이메일 (한 번 이상 로그인한 사용자)"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className="h-8 w-80 max-w-full rounded border border-gray-300 px-2 text-sm"
          data-testid="company-members-add-email-input"
        />
        <button
          type="submit"
          disabled={busy === "__add__"}
          className="h-8 rounded bg-gray-900 px-3 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          data-testid="company-members-add-button"
        >
          멤버 추가
        </button>
      </form>

      <QuotaCard companyId={companyId} mode="view" />

      {adminCount === 0 && data && (
        <div
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"
          data-testid="company-members-settings-no-admin-warning"
        >
          <AlertTriangle size={14} />
          이 회사에는 관리자가 없습니다.
        </div>
      )}

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      ) : isLoading ? (
        <div className="text-sm text-gray-500">불러오는 중…</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table
            className="w-full text-sm"
            data-testid="company-members-settings-list"
          >
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">이름</th>
                <th className="px-4 py-2 font-medium">이메일</th>
                <th className="w-48 px-4 py-2 font-medium">저장 사용량</th>
                <th className="w-32 px-4 py-2 font-medium">역할</th>
                <th className="w-40 px-4 py-2 text-right font-medium">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.members.map((m) => {
                const isAdmin = m.role === "admin"
                return (
                  <tr
                    key={m.user_sub}
                    data-testid={`company-members-settings-row-${m.user_sub}`}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-4 py-2 text-gray-900">
                      {m.name ?? m.user_sub}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
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
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-700"
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
                          data-testid={`company-members-settings-row-${m.user_sub}-quota`}
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                        >
                          한도
                        </button>
                        {isAdmin ? (
                          <button
                            onClick={() => setRole(m, "member")}
                            disabled={busy === m.user_sub}
                            data-testid={`company-members-settings-row-${m.user_sub}-demote`}
                            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                          >
                            강등
                          </button>
                        ) : (
                          <button
                            onClick={() => setRole(m, "admin")}
                            disabled={busy === m.user_sub}
                            data-testid={`company-members-settings-row-${m.user_sub}-promote`}
                            className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            관리자 임명
                          </button>
                        )}
                        {m.user_sub !== authUser?.id && (
                          <button
                            onClick={() => void removeMember(m)}
                            disabled={busy === m.user_sub}
                            data-testid={`company-members-settings-row-${m.user_sub}-remove`}
                            className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            제거
                          </button>
                        )}
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
            className="w-80 space-y-3 rounded-lg bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            data-testid="company-members-quota-modal"
          >
            <h3 className="text-base font-semibold text-gray-900">저장 한도</h3>
            <p className="text-xs text-gray-500">
              {quotaFor.name ?? quotaFor.user_sub} · 현재 사용{" "}
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
                data-testid="company-members-quota-input"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              />
              <span className="text-sm text-gray-500">GB</span>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setQuotaFor(null)}
                data-testid="company-members-quota-cancel"
                className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                취소
              </button>
              <button
                onClick={saveQuota}
                disabled={busy === quotaFor.user_sub}
                data-testid="company-members-quota-save"
                className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
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
      <span className="text-xs text-gray-500">
        {formatBytes(used)} <span className="text-gray-400">/ 무제한</span>
      </span>
    )
  }
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 100
  const over = used > limit
  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-600">
        {formatBytes(used)}{" "}
        <span className="text-gray-400">/ {formatBytes(limit)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full ${over ? "bg-rose-500" : pct > 85 ? "bg-amber-500" : "bg-gray-800"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
