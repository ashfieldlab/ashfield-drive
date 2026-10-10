"use client"

import { useState } from "react"
import { Check, Copy, Download, Eye, EyeOff, KeyRound, Loader2, Lock, LockOpen, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { RecoveryCode, Stage, STRENGTH_LABEL, StrengthBar, useSetup, useUnlock, VAULT, type VaultMode } from "./shared"

/** A: 자물쇠 하나 + 입력칸 하나 */
export function VariantA() {
  const [mode, setMode] = useState<VaultMode>("unlock")
  return (
    <Stage mode={mode} onMode={setMode}>
      <div className="relative w-[380px] max-w-[92vw] rounded-xl border bg-background shadow-2xl" data-testid="pg-vault-unlock-a">
        <button
          type="button"
          aria-label="닫기"
          data-testid="pg-vault-unlock-a-close"
          className="absolute right-3 top-3 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
        {mode === "unlock" ? <Unlock key="u" /> : <Setup key="s" />}
      </div>
    </Stage>
  )
}

function LockBadge({ open, tone = "default" }: { open?: boolean; tone?: "default" | "error" | "ok" }) {
  const Icon = open ? LockOpen : Lock
  return (
    <span
      className={cn(
        "mx-auto grid size-14 place-items-center rounded-full transition-colors",
        tone === "default" && "bg-muted text-foreground",
        tone === "error" && "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300",
        tone === "ok" && "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300",
      )}
    >
      <Icon className="size-6" />
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
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  invalid?: boolean
  testid: string
  autoFocus?: boolean
  mono?: boolean
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
        aria-invalid={invalid}
        data-testid={testid}
        className={cn("h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground", mono && "font-mono uppercase tracking-wider")}
      />
      {!mono && (
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => setShow((s) => !s)} data-testid={`${testid}-reveal`} aria-label="표시">
          {show ? <EyeOff /> : <Eye />}
        </Button>
      )}
    </div>
  )
}

function Unlock() {
  const u = useUnlock()
  if (u.done) {
    return (
      <div className="px-8 pb-8 pt-10 text-center">
        <LockBadge open tone="ok" />
        <h2 className="mt-4 text-base font-semibold">{VAULT.name}</h2>
        <p className="mt-1 text-xs text-muted-foreground">잠금 해제됨</p>
        <Button className="mt-6 h-10 w-full" data-testid="pg-vault-unlock-a-open">
          열기
        </Button>
        <Button variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={u.reset} data-testid="pg-vault-unlock-a-relock">
          다시 잠그기
        </Button>
      </div>
    )
  }
  return (
    <form
      className="px-8 pb-6 pt-10 text-center"
      onSubmit={(e) => {
        e.preventDefault()
        u.submit()
      }}
    >
      <div className={cn(u.error && "animate-[pg-shake_0.35s]")}>
        <LockBadge tone={u.error ? "error" : "default"} />
      </div>
      <h2 className="mt-4 text-base font-semibold">{VAULT.name}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        보안 폴더 · {VAULT.count}개
      </p>
      <div className="mt-6 text-left">
        <PasswordInput
          key={u.recovery ? "r" : "p"}
          value={u.value}
          onChange={u.setValue}
          placeholder={u.recovery ? "XXXX-XXXX-XXXX-XXXX-XXXX" : "암호화 비밀번호"}
          invalid={!!u.error}
          testid="pg-vault-unlock-a-password"
          mono={u.recovery}
          autoFocus
        />
        <p className={cn("mt-1.5 h-4 text-xs text-destructive", !u.error && "invisible")}>{u.error}</p>
      </div>
      <Button type="submit" className="mt-3 h-10 w-full" disabled={!u.value || u.busy} data-testid="pg-vault-unlock-a-submit">
        {u.busy ? (
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
        onClick={u.toggleRecovery}
        data-testid="pg-vault-unlock-a-recovery-toggle"
        className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <KeyRound className="size-3.5" />
        {u.recovery ? "비밀번호 사용" : "복구 코드 사용"}
      </button>
      <style>{`@keyframes pg-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}`}</style>
    </form>
  )
}

function Setup() {
  const s = useSetup()

  if (s.step === "password") {
    return (
      <form
        className="px-8 pb-8 pt-10"
        onSubmit={(e) => {
          e.preventDefault()
          s.create()
        }}
      >
        <LockBadge />
        <h2 className="mt-4 text-center text-base font-semibold">암호화 비밀번호 설정</h2>
        <p className="mt-1 text-center text-xs text-muted-foreground">로그인 비밀번호와 별개</p>
        <div className="mt-6 space-y-2">
          <PasswordInput value={s.pw} onChange={s.setPw} placeholder="8자 이상" testid="pg-vault-unlock-a-setup-password" autoFocus />
          <div className="flex items-center gap-3 px-0.5">
            <StrengthBar value={s.strength} className="flex-1" />
            <span className="w-8 text-right text-[11px] text-muted-foreground">{STRENGTH_LABEL[s.strength]}</span>
          </div>
          <PasswordInput value={s.pw2} onChange={s.setPw2} placeholder="다시 입력" invalid={s.mismatch} testid="pg-vault-unlock-a-setup-confirm" />
          <p className={cn("h-4 text-xs text-destructive", !s.mismatch && "invisible")}>일치하지 않습니다</p>
        </div>
        <Button type="submit" className="mt-2 h-10 w-full" disabled={!s.canCreate} data-testid="pg-vault-unlock-a-setup-submit">
          {s.busy ? (
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

  if (s.step === "done") {
    return (
      <div className="px-8 pb-8 pt-10 text-center">
        <LockBadge open tone="ok" />
        <h2 className="mt-4 text-base font-semibold">설정 완료</h2>
        <Button className="mt-6 h-10 w-full" data-testid="pg-vault-unlock-a-setup-open">
          {VAULT.name} 열기
        </Button>
        <Button variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={s.reset} data-testid="pg-vault-unlock-a-setup-restart">
          처음으로
        </Button>
      </div>
    )
  }

  return (
    <div className="px-8 pb-8 pt-10">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300">
        <KeyRound className="size-6" />
      </span>
      <h2 className="mt-4 text-center text-base font-semibold">복구 코드</h2>
      <p className="mt-1 text-center text-xs text-muted-foreground">지금 한 번만 표시</p>
      <RecoveryCode className="mt-6 text-[13px]" />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={s.copy} data-testid="pg-vault-unlock-a-recovery-copy">
          {s.copied ? <Check /> : <Copy />}
          {s.copied ? "복사됨" : "복사"}
        </Button>
        <Button variant="outline" onClick={s.download} data-testid="pg-vault-unlock-a-recovery-download">
          <Download />
          .txt 저장
        </Button>
      </div>
      <label className="mt-5 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-xs">
        <input
          type="checkbox"
          checked={s.saved}
          onChange={(e) => s.setSaved(e.target.checked)}
          data-testid="pg-vault-unlock-a-recovery-saved"
          className="size-3.5 accent-primary"
        />
        안전한 곳에 보관했습니다
      </label>
      <Button className="mt-3 h-10 w-full" disabled={!s.saved} onClick={() => s.setStep("done")} data-testid="pg-vault-unlock-a-recovery-done">
        완료
      </Button>
    </div>
  )
}
