"use client"

import Link from "next/link"
import { Activity, Building2, Mail } from "lucide-react"

import { useAppContext } from "@/components/providers/app-context"

const SECTIONS = [
  { href: "/admin/workspaces", title: "워크스페이스 관리", icon: Building2 },
  { href: "/admin/smtp", title: "전역 SMTP 설정", icon: Mail },
  { href: "/admin/jobs", title: "작업 모니터링", icon: Activity },
]

export default function AdminIndexPage() {
  const { isSystemAdmin } = useAppContext()

  if (!isSystemAdmin) {
    return (
      <div
        className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-6 text-sm text-amber-800 dark:text-amber-200"
        data-testid="admin-index-no-permission"
      >
        시스템 관리자만 접근할 수 있습니다.
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-8 sm:px-6 lg:px-8" data-testid="admin-index-page">
      <h1 className="mb-4 text-2xl font-bold text-foreground">시스템 관리</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            data-testid={`admin-index-link-${s.href.split("/").pop()}`}
            className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 hover:border-input hover:bg-muted/50"
          >
            <s.icon size={18} className="shrink-0 text-muted-foreground" />
            <p className="font-medium text-foreground">{s.title}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
