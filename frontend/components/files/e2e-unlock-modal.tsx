"use client"

import { useEffect, useState } from "react"
import { Copy, Lock, X } from "lucide-react"

import { useToast } from "@/components/ui-custom/use-toast"
import * as e2e from "@/lib/e2e/session"

interface Props {
  onUnlocked: () => void
  onClose: () => void
}

type Mode = "loading" | "setup" | "unlock" | "recovery"

/**
 * E2E 잠금해제 / 첫 설정 모달 (ADR-0016).
 *  - 키 미설정 → setup (비밀번호 + 복구코드 1회 표시)
 *  - 키 있음   → unlock (비밀번호)
 */
export function E2EUnlockModal({ onUnlocked, onClose }: Props) {
  const { toast } = useToast()
  const [mode, setMode] = useState<Mode>("loading")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState("")
  const [useRecovery, setUseRecovery] = useState(false)

  useEffect(() => {
    void (async () => {
      setMode((await e2e.needsSetup()) ? "setup" : "unlock")
    })()
  }, [])

  async function handleSetup() {
    if (password.length < 8) {
      toast.error("비밀번호는 8자 이상")
      return
    }
    setBusy(true)
    try {
      const { recoveryCode } = await e2e.setup(password)
      setRecoveryCode(recoveryCode)
      setMode("recovery") // 복구코드 1회 표시
    } catch (err) {
      toast.error(`설정 실패: ${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleUnlock() {
    setBusy(true)
    try {
      await e2e.unlock(password, useRecovery)
      onUnlocked()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-[460px] max-w-[92vw] rounded-lg bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
        data-testid="e2e-unlock-modal"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <Lock className="h-4 w-4" /> 보안 폴더 잠금해제
          </div>
          <button onClick={onClose} data-testid="e2e-unlock-close"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 py-4">
          {mode === "loading" && <p className="text-sm text-gray-500">확인 중…</p>}

          {mode === "setup" && (
            <>
              <p className="mb-3 text-sm text-gray-600">
                보안 폴더를 처음 사용합니다. 암호화 비밀번호를 설정하세요. 이
                비밀번호는 <b>로그인 비밀번호와 별개</b>이며, 분실 시 복구 코드로만
                되살릴 수 있습니다. (관리자도 복구 불가)
              </p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="암호화 비밀번호 (8자 이상)"
                className="mb-3 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                data-testid="e2e-setup-password"
                autoFocus
              />
              <button
                onClick={() => void handleSetup()}
                disabled={busy}
                className="w-full rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                data-testid="e2e-setup-submit"
              >
                {busy ? "생성 중…" : "설정"}
              </button>
            </>
          )}

          {mode === "recovery" && (
            <>
              <p className="mb-2 text-sm font-semibold text-rose-700">
                복구 코드 (지금 한 번만 표시됩니다)
              </p>
              <p className="mb-3 text-sm text-gray-600">
                비밀번호를 잊으면 이 코드로만 복구할 수 있습니다. 안전한 곳에
                보관하세요. <b>둘 다 잃으면 데이터를 영구히 열 수 없습니다.</b>
              </p>
              <div className="mb-3 flex items-center gap-2 rounded bg-gray-100 px-3 py-2 font-mono text-sm">
                <span className="flex-1 break-all" data-testid="e2e-recovery-code">{recoveryCode}</span>
                <button
                  onClick={() => { void navigator.clipboard.writeText(recoveryCode); toast.success("복사했습니다") }}
                  data-testid="e2e-recovery-copy"
                  aria-label="복구 코드 복사"
                  className="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <button
                onClick={onUnlocked}
                className="w-full rounded bg-gray-900 px-4 py-2 text-sm text-white"
                data-testid="e2e-recovery-done"
              >
                저장했습니다, 계속
              </button>
            </>
          )}

          {mode === "unlock" && (
            <>
              <p className="mb-3 text-sm text-gray-600">
                {useRecovery ? "복구 코드를 입력하세요." : "암호화 비밀번호를 입력하세요."}
              </p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleUnlock() }}
                placeholder={useRecovery ? "복구 코드" : "암호화 비밀번호"}
                className="mb-3 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                data-testid="e2e-unlock-password"
                autoFocus
              />
              <button
                onClick={() => void handleUnlock()}
                disabled={busy}
                className="mb-2 w-full rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                data-testid="e2e-unlock-submit"
              >
                {busy ? "잠금해제 중…" : "잠금해제"}
              </button>
              <button
                onClick={() => { setUseRecovery((v) => !v); setPassword("") }}
                data-testid="e2e-recovery-toggle"
                className="w-full text-xs text-gray-500 hover:underline"
              >
                {useRecovery ? "비밀번호로 잠금해제" : "비밀번호를 잊으셨나요? 복구 코드 사용"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
