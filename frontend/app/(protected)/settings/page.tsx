"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Building2, ChevronRight, Lock, Mail, ScrollText, Users, Webhook } from "lucide-react"
import { useToast } from "@/components/ui-custom/use-toast"

import { useAppContext } from "@/components/providers/app-context"
import { api } from "@/lib/api-client"
import { useApiGet } from "@/lib/hooks/use-api"
import { E2EUnlockModal } from "@/components/files/e2e-unlock-modal"
import * as e2e from "@/lib/e2e/session"
import type { EmailPreferenceResponse } from "@/lib/types/api"

// 백엔드 _TYPE_CATEGORY(email.py)와 키 일치.
const EMAIL_CATEGORIES = [
  { key: "file_share", label: "파일 공유" },
] as const

export default function SettingsPage() {
  const { toast } = useToast()
  const { activeWorkspaceId, isWorkspaceAdmin, isSystemAdmin } = useAppContext()
  const { data, mutate, isLoading } = useApiGet<EmailPreferenceResponse>(
    "/api/v1/notifications/preferences",
  )

  async function patchPref(body: {
    email_enabled?: boolean
    email_categories?: Record<string, boolean>
  }) {
    try {
      await api<EmailPreferenceResponse>(
        "/api/v1/notifications/preferences",
        { method: "PATCH", body },
      )
      void mutate()
    } catch (e) {
      toast.error(`실패: ${(e as Error).message}`)
    }
  }

  async function toggleEmail() {
    if (!data) return
    await patchPref({ email_enabled: !data.email_enabled })
    toast.success(
      data.email_enabled ? "이메일 알림을 껐습니다" : "이메일 알림을 켰습니다",
    )
  }

  function toggleCategory(key: string) {
    if (!data) return
    // 키 없으면 on 이 기본: 없으면 현재값 true 로 간주.
    const current = data.email_categories[key] !== false
    void patchPref({ email_categories: { [key]: !current } })
  }

  const workspaceBase = activeWorkspaceId
    ? `/settings/workspace/${encodeURIComponent(activeWorkspaceId)}`
    : null

  return (
    <div
      className="h-full space-y-6 overflow-y-auto px-4 py-8 sm:px-6 lg:px-8"
      data-testid="settings-page"
    >
      <h1 className="text-2xl font-bold text-foreground">설정</h1>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">알림</h2>
        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : (
          <div className="space-y-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={data.email_enabled}
                onChange={toggleEmail}
                data-testid="settings-email-toggle"
                className="mt-0.5 rounded border-input"
              />
              <span className="font-medium text-foreground">이메일 알림</span>
            </label>

            <div className="ml-7 space-y-2 border-l border-border/60 pl-4">
              <p className="text-xs font-medium text-muted-foreground">
                받을 이메일 종류
              </p>
              {EMAIL_CATEGORIES.map((c) => (
                <label
                  key={c.key}
                  className="flex items-start gap-3 text-sm"
                  data-testid={`settings-email-category-${c.key}`}
                >
                  <input
                    type="checkbox"
                    checked={data.email_enabled && data.email_categories[c.key] !== false}
                    disabled={!data.email_enabled}
                    onChange={() => toggleCategory(c.key)}
                    data-testid={`settings-email-category-${c.key}-toggle`}
                    className="mt-0.5 rounded border-input disabled:opacity-40"
                  />
                  <span className={data.email_enabled ? "" : "opacity-40"}>
                    <span className="block text-foreground">{c.label}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </section>

      <E2ESettingsSection />

      {isSystemAdmin && (
        <section className="rounded-lg border border-border bg-card">
          <header className="border-b border-border/60 px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">시스템 관리</h2>
          </header>
          <ul className="divide-y divide-border/60">
            <SettingsRow
              href="/admin/workspaces"
              icon={<Building2 size={16} />}
              title="워크스페이스 관리"
              testid="settings-link-admin-workspaces"
            />
            <SettingsRow
              href="/admin/smtp"
              icon={<Mail size={16} />}
              title="SMTP 설정"
              testid="settings-link-admin-smtp"
            />
            <SettingsRow
              href="/audit"
              icon={<ScrollText size={16} />}
              title="감사 로그"
              testid="settings-link-audit"
            />
            <SettingsRow
              href="/webhooks"
              icon={<Webhook size={16} />}
              title="웹훅"
              testid="settings-link-webhooks"
            />
          </ul>
        </section>
      )}

      {isWorkspaceAdmin && workspaceBase && (
        <section className="rounded-lg border border-border bg-card">
          <header className="border-b border-border/60 px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              워크스페이스 관리 ({activeWorkspaceId})
            </h2>
          </header>
          <ul className="divide-y divide-border/60">
            <SettingsRow
              href={`${workspaceBase}/members`}
              icon={<Users size={16} />}
              title="멤버"
              testid="settings-link-members"
            />
            <SettingsRow
              href="/audit"
              icon={<ScrollText size={16} />}
              title="감사 로그"
              testid="settings-link-workspace-audit"
            />
            <SettingsRow
              href={`${workspaceBase}/smtp`}
              icon={<Mail size={16} />}
              title="SMTP 설정"
              testid="settings-link-smtp"
            />
          </ul>
        </section>
      )}
    </div>
  )
}

// 보안 폴더(E2E) 비밀번호: 폴더에 들어가기 전에 미리 설정해 둘 수 있는 진입점.
// 미설정이면 남이 보안 폴더를 공유해 줄 수 없으므로(공개키가 없어서), 여기서 먼저 생성.
function E2ESettingsSection() {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [showModal, setShowModal] = useState(false)

  const refresh = useCallback(() => {
    void e2e.needsSetup().then(setNeedsSetup)
  }, [])
  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <section className="rounded-lg border border-border bg-card p-5" data-testid="settings-e2e">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Lock size={15} className="text-muted-foreground" /> 보안 폴더
      </h2>
      {needsSetup === null ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : needsSetup ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">아직 보안 폴더 비밀번호가 없습니다.</p>
          <button
            onClick={() => setShowModal(true)}
            data-testid="settings-e2e-setup-button"
            className="shrink-0 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            설정하기
          </button>
        </div>
      ) : (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">✅ 설정됨</p>
      )}
      {showModal && (
        <E2EUnlockModal
          onUnlocked={() => {
            setShowModal(false)
            refresh()
          }}
          onClose={() => {
            setShowModal(false)
            refresh()
          }}
        />
      )}
    </section>
  )
}

function SettingsRow({
  href,
  icon,
  title,
  testid,
}: {
  href: string
  icon: React.ReactNode
  title: string
  testid: string
}) {
  return (
    <li>
      <Link
        href={href}
        data-testid={testid}
        className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/50"
      >
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">{icon}</span>
          <div className="text-sm font-medium text-foreground">{title}</div>
        </div>
        <ChevronRight size={16} className="shrink-0 text-muted-foreground/70" />
      </Link>
    </li>
  )
}
