"use client"

/**
 * 토스트 훅 — sonner 의 전역 `toast` 를 돌려준다. layout 에 <Toaster /> 1회 마운트.
 *
 * 사용:
 *   const { toast } = useToast()
 *   toast.success("저장했습니다")
 *   toast.error(`저장 실패: ${message}`)
 *
 * `toast` 는 모듈 단위 싱글턴이라 참조가 안정적 — effect 의존성에 넣어도 재실행되지 않는다.
 */

import { toast } from "sonner"

const value = { toast } as const

export function useToast(): typeof value {
  return value
}
