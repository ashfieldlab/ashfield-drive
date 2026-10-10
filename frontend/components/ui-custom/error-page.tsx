"use client"

import Link from "next/link"
import { AlertCircle, Ban, FileQuestion, Lock, Wifi } from "lucide-react"

import { Button } from "@/components/ui/button"

export type ErrorPageType =
  | "unknown-error"
  | "404"
  | "no-permission"
  | "network"
  | "session-expired"

interface Props {
  type?: ErrorPageType
  title?: string
  description?: string
  /** primary 액션: 보통 "다시 시도" */
  onClickPrimary?: () => void
  primaryLabel?: string
  /** secondary 액션: 보통 "처음으로" */
  onClickSecondary?: () => void
  secondaryLabel?: string
}

const presets: Record<
  ErrorPageType,
  {
    icon: React.ComponentType<{ size?: number; className?: string }>
    title: string
    description: string
  }
> = {
  "unknown-error": {
    icon: AlertCircle,
    title: "문제가 발생했습니다",
    description: "잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요.",
  },
  "404": {
    icon: FileQuestion,
    title: "페이지를 찾을 수 없습니다",
    description: "요청하신 페이지가 이동되었거나 더 이상 존재하지 않습니다.",
  },
  "no-permission": {
    icon: Ban,
    title: "접근 권한이 없습니다",
    description: "이 페이지를 보려면 적절한 권한이 필요합니다.",
  },
  "network": {
    icon: Wifi,
    title: "네트워크 연결 문제",
    description: "서버와 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  },
  "session-expired": {
    icon: Lock,
    title: "세션이 만료되었습니다",
    description: "다시 로그인해 주세요.",
  },
}

export function ErrorPage({
  type = "unknown-error",
  title,
  description,
  onClickPrimary,
  primaryLabel = "다시 시도",
  onClickSecondary,
  secondaryLabel = "처음으로",
}: Props) {
  const preset = presets[type]
  const Icon = preset.icon

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-5">
        <Icon size={48} className="mx-auto text-muted-foreground/70" />
        <div className="space-y-2">
          <h1
            className="text-2xl font-bold text-foreground"
            data-testid="error-page-title"
          >
            {title ?? preset.title}
          </h1>
          <p className="text-sm text-muted-foreground">{description ?? preset.description}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {onClickPrimary && (
            <Button
              size="lg"
              onClick={onClickPrimary}
              data-testid="error-page-primary-button"
            >
              {primaryLabel}
            </Button>
          )}
          {onClickSecondary ? (
            <Button
              size="lg"
              variant="outline"
              onClick={onClickSecondary}
              data-testid="error-page-secondary-button"
            >
              {secondaryLabel}
            </Button>
          ) : (
            <Link
              href="/"
              data-testid="error-page-home-link"
              className="inline-flex items-center justify-center h-9 px-4 py-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              {secondaryLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
