"use client"

import { useEffect, useState, type ReactNode } from "react"
import { SWRConfig } from "swr"
import { AlertTriangle, X } from "lucide-react"

import { useToast } from "@/components/ui-custom/use-toast"
import { ApiError } from "@/lib/api-client"
import { useAppContext } from "@/components/providers/app-context"
import { logger } from "@/lib/utils/logger"

interface Props {
  children: ReactNode
}

/**
 * SWR 글로벌 에러 핸들러 — SPEC §2.6.
 *
 *   상태   처리
 *   0      상단 배너 (persistent) — 진짜 무응답(전 요청 실패) 만
 *   401    signOut (api-client에서 이미 처리)
 *   4xx/5xx 토스트 — 특정 요청 실패는 그 페이지의 인라인 에러가 맥락을 보여줌
 *   성공   배너 자동 해제
 *
 * 502 같은 단일 엔드포인트 5xx 에 전역 배너를 띄우면 페이지 인라인 에러와 겹치고
 * "서버 전체 불가"로 오인시킴 → status 0(무응답) 만 배너.
 */
export function SwrErrorBridge({ children }: Props) {
  void useAppContext() // provider 존재 확인용 — bootstrapped 게이팅은 제거
  const { toast } = useToast()
  const [systemError, setSystemError] = useState<string | null>(null)

  return (
    <>
      <SWRConfig
        value={{
          onError: (err) => {
            if (!(err instanceof ApiError)) {
              logger.error("swr_unknown_error", {
                category: "api",
                error: String(err),
              })
              return
            }
            // status 0(무응답=전역 통신 불가) 만 상단 배너
            if (err.status === 0) {
              setSystemError(err.message || "서버와 통신할 수 없습니다.")
              return
            }
            // 401 → api-client가 이미 signOut 처리
            if (err.status === 401) return
            // 403 + 그 외 4xx/5xx → 토스트 (페이지 인라인 에러와 중복 배너 방지)
            if (err.status === 403) {
              toast.error(err.message || "권한이 없습니다")
              return
            }
            if (err.status >= 400) {
              toast.error(err.message || `요청 실패 (${err.status})`)
            }
          },
          onSuccess: () => {
            // 성공 응답 한 번이라도 오면 배너 해제. functional updater 로
            // stale closure (systemError 가 항상 첫 render 값 으로 보임) 회피.
            setSystemError((prev) => (prev === null ? prev : null))
          },
        }}
      >
        {children}
      </SWRConfig>
      {systemError && (
        <SystemErrorBanner
          message={systemError}
          onDismiss={() => setSystemError(null)}
        />
      )}
    </>
  )
}

function SystemErrorBanner({
  message,
  onDismiss,
}: {
  message: string
  onDismiss: () => void
}) {
  // SSR 안전 — 클라이언트에서만 렌더
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 bg-rose-50 border-b border-rose-200 z-[150]"
      role="alert"
      data-testid="system-error-banner"
    >
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3">
        <AlertTriangle size={16} className="text-rose-700 shrink-0" />
        <p className="flex-1 text-sm text-rose-800">{message}</p>
        <button
          onClick={onDismiss}
          className="text-rose-700 hover:text-rose-900"
          aria-label="닫기"
          data-testid="system-error-banner-dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
