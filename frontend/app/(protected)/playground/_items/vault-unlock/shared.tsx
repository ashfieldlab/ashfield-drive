"use client"

import { useState } from "react"

import { cn } from "@/lib/utils"

import { NODES, type MockKind } from "../_mock"

export type VaultMode = "setup" | "unlock"

export const VAULT = NODES.find((n) => n.vault)!

/** 1회만 보여주는 복구 코드 (실제는 lib/e2e/crypto 의 generateRecoveryCode) */
export const RECOVERY_CODE = "K7QM-2XRP-9DHW-T4NB-ZC8F"

export const VAULT_FILES: { name: string; kind: MockKind; size: number }[] = [
  { name: "2026 사무실 임대차 계약서.pdf", kind: "pdf", size: 2_400_000 },
  { name: "투자 계약서 서명본.pdf", kind: "pdf", size: 3_100_000 },
  { name: "주주간 계약.pdf", kind: "pdf", size: 1_800_000 },
  { name: "용역 계약 v2.docx", kind: "doc", size: 220_000 },
  { name: "NDA 파트너사.pdf", kind: "pdf", size: 640_000 },
  { name: "근로계약서 김하늘.pdf", kind: "pdf", size: 410_000 },
  { name: "법인 등기부등본.pdf", kind: "pdf", size: 980_000 },
  { name: "인감증명서.jpg", kind: "image", size: 2_850_000 },
]

/** 0~4 단계 강도 (모양만) */
export function strength(pw: string) {
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++
  return pw ? Math.max(1, s) : 0
}

export const STRENGTH_LABEL = ["", "약함", "보통", "좋음", "강함"]

export function StrengthBar({ value, className }: { value: number; className?: string }) {
  const tone = ["", "bg-rose-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"][value]
  return (
    <div className={cn("flex gap-1", className)}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={cn("h-1 flex-1 rounded-full bg-muted transition-colors", i <= value && tone)} />
      ))}
    </div>
  )
}

/**
 * 가짜 잠금 해제: 8자 미만이면 실패.
 * 복구 코드는 RECOVERY_CODE 와 같아야 통과.
 */
export function useUnlock() {
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [recovery, setRecovery] = useState(false)

  function submit() {
    if (!value || busy) return
    setBusy(true)
    setError(null)
    setTimeout(() => {
      setBusy(false)
      const ok = recovery ? value.replace(/-/g, "").toUpperCase() === RECOVERY_CODE.replace(/-/g, "") : value.length >= 8
      if (!ok) {
        setError(recovery ? "복구 코드가 올바르지 않습니다" : "비밀번호가 올바르지 않습니다")
        return
      }
      setDone(true)
    }, 1100)
  }

  return {
    value,
    setValue: (v: string) => {
      setValue(v)
      setError(null)
    },
    busy,
    error,
    done,
    recovery,
    toggleRecovery: () => {
      setRecovery((r) => !r)
      setValue("")
      setError(null)
    },
    reset: () => {
      setDone(false)
      setValue("")
      setError(null)
    },
    submit,
  }
}

/** 설정 흐름: 비밀번호 → 복구 코드 → 확인 → 완료 */
export function useSetup() {
  const [step, setStep] = useState<"password" | "recovery" | "confirm" | "done">("password")
  const [pw, setPw] = useState("")
  const [pw2, setPw2] = useState("")
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const s = strength(pw)
  const mismatch = pw2.length > 0 && pw !== pw2
  const canCreate = pw.length >= 8 && pw === pw2 && !busy

  function create() {
    if (!canCreate) return
    setBusy(true)
    setTimeout(() => {
      setBusy(false)
      setStep("recovery")
    }, 1200)
  }

  function copy() {
    void navigator.clipboard?.writeText(RECOVERY_CODE).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function download() {
    const blob = new Blob([`Ashfield Drive 복구 코드\n${RECOVERY_CODE}\n`], { type: "text/plain" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "ashfield-recovery-code.txt"
    a.click()
    URL.revokeObjectURL(a.href)
    setSaved(true)
  }

  return {
    step,
    setStep,
    pw,
    setPw,
    pw2,
    setPw2,
    strength: s,
    mismatch,
    canCreate,
    busy,
    create,
    copied,
    copy,
    saved,
    setSaved,
    download,
    reset: () => {
      setStep("password")
      setPw("")
      setPw2("")
      setSaved(false)
    },
  }
}

/** 상태 전환 토글 (모달 위에 띄움) */
export function ModeToggle({ mode, onMode }: { mode: VaultMode; onMode: (m: VaultMode) => void }) {
  return (
    <div className="flex rounded-full bg-background/90 p-1 shadow-lg ring-1 ring-border backdrop-blur">
      {(
        [
          ["setup", "처음 설정"],
          ["unlock", "잠금 해제"],
        ] as const
      ).map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onMode(k)}
          data-testid={`pg-vault-unlock-mode-${k}`}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            mode === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function Stage({ mode, onMode, children }: { mode: VaultMode; onMode: (m: VaultMode) => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <ModeToggle mode={mode} onMode={onMode} />
      {children}
    </div>
  )
}

/** 복구 코드를 묶음별로 */
export function RecoveryCode({ className, highlight }: { className?: string; highlight?: number }) {
  return (
    <div className={cn("grid grid-cols-5 gap-1.5 font-mono text-sm font-semibold tracking-wider", className)} data-testid="pg-vault-unlock-recovery-code">
      {RECOVERY_CODE.split("-").map((g, i) => (
        <span
          key={i}
          className={cn(
            "rounded-md bg-muted py-2 text-center",
            highlight === i && "bg-amber-100 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:ring-amber-800",
          )}
        >
          {g}
        </span>
      ))}
    </div>
  )
}
