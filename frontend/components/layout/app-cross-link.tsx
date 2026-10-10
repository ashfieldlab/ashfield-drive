"use client"

import { Calendar } from "lucide-react"

import { env } from "@/lib/env"

// 일정 앱(ashfield-calendar)으로 가는 은근한 링크. 다른 origin 이라 <a>(풀 페이지 이동). URL(env) 없으면 숨김.
export function AppCrossLink() {
  if (!env.calendarUrl) return null
  return (
    <a
      href={env.calendarUrl}
      data-testid="app-cross-link"
      title="일정 앱으로 이동"
      className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Calendar size={16} />
      <span className="hidden sm:inline">일정</span>
    </a>
  )
}
