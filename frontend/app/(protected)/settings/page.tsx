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
  { key: "file_share", label: "파일 공유", desc: "파일·폴더를 공유받았을 때" },
] as const

export default function SettingsPage() {
  const { toast } = useToast()
  const { activeCompanyId, isCompanyAdmin, isSystemAdmin } = useAppContext()
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
    // 키 없으면 on 이 기본 — 없으면 현재값 true 로 간주.
    const current = data.email_categories[key] !== false
    void patchPref({ email_categories: { [key]: !current } })
  }

  const companyBase = activeCompanyId
    ? `/settings/company/${encodeURIComponent(activeCompanyId)}`
    : null

  return (
    <div
      className="h-full space-y-6 overflow-y-auto px-4 py-8 sm:px-6 lg:px-8"
      data-testid="settings-page"
    >
      <h1 className="text-2xl font-bold text-gray-900">설정</h1>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">알림</h2>
        {isLoading || !data ? (
          <p className="text-sm text-gray-500">불러오는 중…</p>
        ) : (
          <div className="space-y-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={data.email_enabled}
                onChange={toggleEmail}
                data-testid="settings-email-toggle"
                className="mt-0.5 rounded border-gray-300"
              />
              <span>
                <span className="block font-medium text-gray-900">이메일 알림</span>
                <span className="block text-xs text-gray-500">
                  끄면 이메일은 보내지 않고 앱 안에서만 알림이 표시됩니다.
                </span>
              </span>
            </label>

            <div className="ml-7 space-y-2 border-l border-gray-100 pl-4">
              <p className="text-xs font-medium text-gray-500">
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
                    className="mt-0.5 rounded border-gray-300 disabled:opacity-40"
                  />
                  <span className={data.email_enabled ? "" : "opacity-40"}>
                    <span className="block text-gray-900">{c.label}</span>
                    <span className="block text-xs text-gray-500">{c.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </section>

      <E2ESettingsSection />

      {isSystemAdmin && (
        <section className="rounded-lg border border-gray-200 bg-white">
          <header className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-900">시스템 관리</h2>
            <p className="mt-0.5 text-xs text-gray-500">시스템 관리자만 보입니다.</p>
          </header>
          <ul className="divide-y divide-gray-100">
            <SettingsRow
              href="/admin/companies"
              icon={<Building2 size={16} />}
              title="회사 관리"
              desc="전체 회사 조회·관리"
              testid="settings-link-admin-companies"
            />
            <SettingsRow
              href="/admin/smtp"
              icon={<Mail size={16} />}
              title="SMTP 설정"
              desc="시스템 기본 메일 발송 서버"
              testid="settings-link-admin-smtp"
            />
            <SettingsRow
              href="/audit"
              icon={<ScrollText size={16} />}
              title="감사 로그"
              desc="시스템 변경 이력 조회"
              testid="settings-link-audit"
            />
            <SettingsRow
              href="/webhooks"
              icon={<Webhook size={16} />}
              title="웹훅"
              desc="외부 시스템 연동용 웹훅 관리"
              testid="settings-link-webhooks"
            />
          </ul>
        </section>
      )}

      {isCompanyAdmin && companyBase && (
        <section className="rounded-lg border border-gray-200 bg-white">
          <header className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-900">
              회사 관리 ({activeCompanyId})
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              회사 관리자만 보입니다.
            </p>
          </header>
          <ul className="divide-y divide-gray-100">
            <SettingsRow
              href={`${companyBase}/members`}
              icon={<Users size={16} />}
              title="멤버"
              desc="워크스페이스 멤버 보기 · 저장 한도 · 관리는 Ashfield 계정에서"
              testid="settings-link-members"
            />
            <SettingsRow
              href="/audit"
              icon={<ScrollText size={16} />}
              title="감사 로그"
              desc="회사 내 변경 이력 조회 · 필터 · CSV 내보내기"
              testid="settings-link-company-audit"
            />
            <SettingsRow
              href={`${companyBase}/smtp`}
              icon={<Mail size={16} />}
              title="SMTP 설정"
              desc="이 회사 전용 메일 발송 서버. 미설정 시 시스템 SMTP 사용."
              testid="settings-link-smtp"
            />
          </ul>
        </section>
      )}
    </div>
  )
}

// 보안 폴더(E2E) 비밀번호 — 폴더에 들어가기 전에 미리 설정해 둘 수 있는 진입점.
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
    <section className="rounded-lg border border-gray-200 bg-white p-5" data-testid="settings-e2e">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Lock size={15} className="text-gray-500" /> 보안 폴더
      </h2>
      {needsSetup === null ? (
        <p className="text-sm text-gray-500">불러오는 중…</p>
      ) : needsSetup ? (
        <div className="flex items-start justify-between gap-4">
          <div className="text-sm text-gray-600">
            <p>아직 보안 폴더 비밀번호가 없습니다.</p>
            <p className="mt-1">
              보안 폴더를 사용하거나{" "}
              <b className="text-gray-800">다른 사람에게 공유받으려면</b> 먼저
              비밀번호를 만들어야 합니다.
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            data-testid="settings-e2e-setup-button"
            className="shrink-0 rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            설정하기
          </button>
        </div>
      ) : (
        <p className="text-sm text-emerald-700">✅ 설정됨. 보안 폴더를 사용하고 공유받을 수 있습니다.</p>
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
  desc,
  testid,
}: {
  href: string
  icon: React.ReactNode
  title: string
  desc?: string
  testid: string
}) {
  return (
    <li>
      <Link
        href={href}
        data-testid={testid}
        className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-gray-50"
      >
        <div className="flex items-center gap-3">
          <span className="text-gray-500">{icon}</span>
          <div>
            <div className="text-sm font-medium text-gray-900">{title}</div>
            {desc && <div className="mt-0.5 text-xs text-gray-500">{desc}</div>}
          </div>
        </div>
        <ChevronRight size={16} className="shrink-0 text-gray-400" />
      </Link>
    </li>
  )
}
