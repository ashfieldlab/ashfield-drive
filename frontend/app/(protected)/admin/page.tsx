"use client"

import Link from "next/link"
import { Activity, Building2, Mail } from "lucide-react"

import { useAppContext } from "@/components/providers/app-context"

const SECTIONS = [
  { href: "/admin/companies", title: "회사 관리", desc: "등록 회사 조회·멤버 관리", icon: Building2 },
  { href: "/admin/smtp", title: "전역 SMTP 설정", desc: "메일 발송 서버 설정·테스트", icon: Mail },
  { href: "/admin/jobs", title: "작업 모니터링", desc: "백그라운드 작업 실행 상태·이력", icon: Activity },
]

export default function AdminIndexPage() {
  const { isSystemAdmin } = useAppContext()

  if (!isSystemAdmin) {
    return (
      <div
        className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800"
        data-testid="admin-index-no-permission"
      >
        시스템 관리자만 접근할 수 있습니다.
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-8 sm:px-6 lg:px-8" data-testid="admin-index-page">
      <h1 className="mb-4 text-2xl font-bold text-gray-900">시스템 관리</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            data-testid={`admin-index-link-${s.href.split("/").pop()}`}
            className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 hover:bg-gray-50"
          >
            <s.icon size={18} className="mt-0.5 shrink-0 text-gray-500" />
            <div>
              <p className="font-medium text-gray-900">{s.title}</p>
              <p className="mt-0.5 text-xs text-gray-500">{s.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
