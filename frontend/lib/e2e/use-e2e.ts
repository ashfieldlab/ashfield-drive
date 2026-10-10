"use client"

/**
 * E2E 세션 훅 (ADR-0016): 잠금 상태 + 설정/잠금해제 액션.
 *
 * 실제 키는 session.ts(모듈 싱글톤) 메모리에. 이 훅은 React 리렌더용 상태 +
 * "vault 접근 전 잠금해제 보장" 게이트를 제공.
 */

import { useCallback, useState } from "react"

import * as e2e from "./session"

export function useE2E() {
  const [unlocked, setUnlocked] = useState<boolean>(e2e.isUnlocked())
  const [open, setOpen] = useState(false)
  // 잠금해제 모달이 닫힐 때 resolve 할 대기자 (ensureUnlocked 용)
  const [resolver, setResolver] = useState<(() => void) | null>(null)

  const requestUnlock = useCallback((): Promise<void> => {
    // 다른 컴포넌트(공유 모달 등)에서 이미 모듈 세션을 풀었으면 로컬 state 만 동기화.
    // 안 그러면 화면은 잠김(unlocked=false)인데 모달도 안 떠 데드락.
    if (e2e.isUnlocked()) {
      setUnlocked(true)
      return Promise.resolve()
    }
    setOpen(true)
    return new Promise<void>((resolve) => setResolver(() => resolve))
  }, [])

  const onUnlocked = useCallback(() => {
    setUnlocked(true)
    setOpen(false)
    resolver?.()
    setResolver(null)
  }, [resolver])

  const onCancel = useCallback(() => {
    setOpen(false)
    setResolver(null)
  }, [])

  const lock = useCallback(() => {
    e2e.lock()
    setUnlocked(false)
  }, [])

  return { unlocked, open, requestUnlock, onUnlocked, onCancel, lock }
}
