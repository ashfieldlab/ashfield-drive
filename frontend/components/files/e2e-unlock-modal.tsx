"use client"

import { useEffect, useState } from "react"
import { Check, Copy, Download, Eye, EyeOff, KeyRound, Loader2, Lock, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui-custom/use-toast"
import { cn } from "@/lib/utils"
import { logger } from "@/lib/utils/logger"
import * as e2e from "@/lib/e2e/session"

interface Props {
  onUnlocked: () => void
  onClose: () => void
}

type Mode = "loading" | "setup" | "unlock" | "recovery"

/** 0~4 단계 강도 (모양만: 실제 검증은 길이 8자 이상) */
function strength(pw: string) {
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++
  return pw ? Math.max(1, s) : 0
}
const STRENGTH_LABEL = ["", "약함", "보통", "좋음", "강함"]

/** 복구 코드 입력 정규화: 대문자, 구분자 무시 후 XXXX-XXXX-... (crypto.generateRecoveryCode 형식) */
function normalizeRecovery(v: string) {
  const raw = v.toUpperCase().replace(/[^A-Z0-9]/g, "")
  return raw.match(/.{1,4}/g)?.join("-") ?? ""
}

/**
 * E2E 잠금해제 / 첫 설정 모달 (ADR-0016).
 *  - 키 미설정 → setup (비밀번호 + 확인) → recovery (복구코드 1회 표시)
 *  - 키 있음   → unlock (비밀번호 또는 복구 코드)
 */
export function E2EUnlockModal({ onUnlocked, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("loading")
  const [recoveryCode, setRecoveryCode] = useState("")

  useEffect(() => {
    void (async () => {
      try {
        setMode((await e2e.needsSetup()) ? "setup" : "unlock")
      } catch (err) {
        logger.error("e2e_needs_setup_failed", { category: "api", error: String(err) })
        setMode("unlock")
      }
    })()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // 복구 코드 화면은 실수로 닫히지 않게 Esc 무시
      if (e.key === "Escape" && mode !== "recovery") {
        e.stopImmediatePropagation()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [mode, onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
      onClick={() => mode !== "recovery" && onClose()}
    >
      <div
        className="relative w-[380px] max-w-full rounded-xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="보안 폴더"
        data-testid="e2e-unlock-modal"
      >
        {mode !== "recovery" && (
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            data-testid="e2e-unlock-close"
            className="absolute top-3 right-3 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
        {mode === "loading" && (
          <div className="flex flex-col items-center px-8 pt-10 pb-10">
            <LockBadge />
            <Loader2 className="mt-6 size-5 animate-spin text-muted-foreground" data-testid="e2e-unlock-loading" />
          </div>
        )}
        {mode === "unlock" && <Unlock onUnlocked={onUnlocked} />}
        {mode === "setup" && (
          <Setup
            onCreated={(code) => {
              setRecoveryCode(code)
              setMode("recovery") // 복구코드 1회 표시
            }}
          />
        )}
        {mode === "recovery" && <Recovery code={recoveryCode} onDone={onUnlocked} />}
        <style>{`@keyframes e2e-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}`}</style>
      </div>
    </div>
  )
}

function LockBadge({ tone = "default" }: { tone?: "default" | "error" }) {
  return (
    <span
      className={cn(
        "mx-auto grid size-14 place-items-center rounded-full transition-colors",
        tone === "default" && "bg-muted text-foreground",
        tone === "error" && "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300",
      )}
    >
      <Lock className="size-6" />
    </span>
  )
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  invalid,
  testid,
  autoFocus,
  mono,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  invalid?: boolean
  testid: string
  autoFocus?: boolean
  mono?: boolean
  disabled?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div
      className={cn(
        "flex h-10 items-center rounded-lg border border-input bg-background pr-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
        invalid && "border-destructive focus-within:border-destructive focus-within:ring-destructive/20",
      )}
    >
      <input
        type={show || mono ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        aria-invalid={invalid}
        data-testid={testid}
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground",
          mono && "font-mono tracking-wider uppercase placeholder:normal-case",
        )}
      />
      {!mono && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setShow((s) => !s)}
          data-testid={`${testid}-reveal`}
          aria-label={show ? "숨기기" : "표시"}
        >
          {show ? <EyeOff /> : <Eye />}
        </Button>
      )}
    </div>
  )
}

function Unlock({ onUnlocked }: { onUnlocked: () => void }) {
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [useRecovery, setUseRecovery] = useState(false)

  async function submit() {
    if (!value || busy) return
    setBusy(true)
    setError(null)
    try {
      await e2e.unlock(useRecovery ? normalizeRecovery(value) : value, useRecovery)
      onUnlocked()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(useRecovery && msg === "비밀번호가 올바르지 않습니다" ? "복구 코드가 올바르지 않습니다" : msg)
      setShake((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="px-8 pt-10 pb-6 text-center"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div key={shake} className={cn(shake > 0 && "animate-[e2e-shake_0.35s]")}>
        <LockBadge tone={error ? "error" : "default"} />
      </div>
      <h2 className="mt-4 text-base font-semibold">보안 폴더</h2>
      <p className="mt-1 text-xs text-muted-foreground">{useRecovery ? "복구 코드" : "암호화 비밀번호"}</p>
      <div className="mt-6 text-left">
        <PasswordInput
          key={useRecovery ? "r" : "p"}
          value={value}
          onChange={(v) => {
            setValue(v)
            setError(null)
          }}
          placeholder={useRecovery ? "XXXX-XXXX-XXXX-XXXX-XXXX" : "암호화 비밀번호"}
          invalid={!!error}
          testid="e2e-unlock-password"
          mono={useRecovery}
          disabled={busy}
          autoFocus
        />
        <p
          className={cn("mt-1.5 h-4 text-xs text-destructive", !error && "invisible")}
          data-testid="e2e-unlock-error"
          role={error ? "alert" : undefined}
        >
          {error}
        </p>
      </div>
      <Button type="submit" className="mt-3 h-10 w-full" disabled={!value || busy} data-testid="e2e-unlock-submit">
        {busy ? (
          <>
            <Loader2 className="animate-spin" />
            해제 중
          </>
        ) : (
          "잠금 해제"
        )}
      </Button>
      <button
        type="button"
        onClick={() => {
          setUseRecovery((v) => !v)
          setValue("")
          setError(null)
        }}
        data-testid="e2e-recovery-toggle"
        className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <KeyRound className="size-3.5" />
        {useRecovery ? "비밀번호 사용" : "복구 코드 사용"}
      </button>
    </form>
  )
}

function Setup({ onCreated }: { onCreated: (code: string) => void }) {
  const { toast } = useToast()
  const [pw, setPw] = useState("")
  const [pw2, setPw2] = useState("")
  const [busy, setBusy] = useState(false)
  const s = strength(pw)
  const mismatch = pw2.length > 0 && pw !== pw2
  const canCreate = pw.length >= 8 && pw === pw2 && !busy
  const tone = ["", "bg-rose-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"][s]

  async function create() {
    if (!canCreate) return
    setBusy(true)
    try {
      const { recoveryCode } = await e2e.setup(pw)
      onCreated(recoveryCode)
    } catch (err) {
      toast.error(`설정 실패: ${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="px-8 pt-10 pb-8"
      onSubmit={(e) => {
        e.preventDefault()
        void create()
      }}
    >
      <LockBadge />
      <h2 className="mt-4 text-center text-base font-semibold">암호화 비밀번호 설정</h2>
      <p className="mt-1 text-center text-xs text-muted-foreground">로그인 비밀번호와 별개</p>
      <div className="mt-6 space-y-2">
        <PasswordInput
          value={pw}
          onChange={setPw}
          placeholder="8자 이상"
          testid="e2e-setup-password"
          disabled={busy}
          autoFocus
        />
        <div className="flex items-center gap-3 px-0.5">
          <div className="flex flex-1 gap-1" data-testid="e2e-setup-strength">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={cn("h-1 flex-1 rounded-full bg-muted transition-colors", i <= s && tone)} />
            ))}
          </div>
          <span className="w-8 text-right text-[11px] text-muted-foreground">{STRENGTH_LABEL[s]}</span>
        </div>
        <PasswordInput
          value={pw2}
          onChange={setPw2}
          placeholder="다시 입력"
          invalid={mismatch}
          disabled={busy}
          testid="e2e-setup-confirm"
        />
        <p className={cn("h-4 text-xs text-destructive", !mismatch && "invisible")}>일치하지 않습니다</p>
      </div>
      <Button type="submit" className="mt-2 h-10 w-full" disabled={!canCreate} data-testid="e2e-setup-submit">
        {busy ? (
          <>
            <Loader2 className="animate-spin" />
            키 생성 중
          </>
        ) : (
          "다음"
        )}
      </Button>
    </form>
  )
}

function Recovery({ code, onDone }: { code: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)

  function copy() {
    void navigator.clipboard?.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function download() {
    const blob = new Blob([`Ashfield Drive 복구 코드\n${code}\n`], { type: "text/plain" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "ashfield-recovery-code.txt"
    a.click()
    URL.revokeObjectURL(a.href)
    setSaved(true)
  }

  return (
    <div className="px-8 pt-10 pb-8">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300">
        <KeyRound className="size-6" />
      </span>
      <h2 className="mt-4 text-center text-base font-semibold">복구 코드</h2>
      <p className="mt-1 text-center text-xs text-muted-foreground">지금 한 번만 표시</p>
      <div
        className="mt-6 grid grid-cols-5 gap-1.5 font-mono text-[13px] font-semibold tracking-wider"
        data-testid="e2e-recovery-code"
        aria-label={code}
      >
        {code.split("-").map((g, i) => (
          <span key={i} className="rounded-md bg-muted py-2 text-center">
            {g}
          </span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={copy} data-testid="e2e-recovery-copy">
          {copied ? <Check /> : <Copy />}
          {copied ? "복사됨" : "복사"}
        </Button>
        <Button variant="outline" onClick={download} data-testid="e2e-recovery-download">
          <Download />
          .txt 저장
        </Button>
      </div>
      <label className="mt-5 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-xs">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          data-testid="e2e-recovery-saved"
          className="size-3.5 accent-primary"
        />
        안전한 곳에 보관했습니다
      </label>
      <Button className="mt-3 h-10 w-full" disabled={!saved} onClick={onDone} data-testid="e2e-recovery-done">
        완료
      </Button>
    </div>
  )
}
