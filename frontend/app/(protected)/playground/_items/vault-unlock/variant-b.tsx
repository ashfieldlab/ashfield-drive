"use client"

import { useEffect, useState } from "react"
import { AlertCircle, ArrowLeft, Check, Copy, Download, Loader2, Lock, ShieldCheck, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { formatBytes } from "../_mock"
import {
  RECOVERY_CODE,
  RecoveryCode,
  Stage,
  STRENGTH_LABEL,
  StrengthBar,
  useSetup,
  useUnlock,
  VAULT,
  type VaultMode,
} from "./shared"

/** B: 단계별 마법사 (왼쪽 단계 레일) */
export function VariantB() {
  const [mode, setMode] = useState<VaultMode>("setup")
  return (
    <Stage mode={mode} onMode={setMode}>
      <div className="flex h-[440px] w-[680px] max-w-[94vw] overflow-hidden rounded-xl border bg-background shadow-2xl" data-testid="pg-vault-unlock-b">
        {mode === "setup" ? <Setup key="s" /> : <Unlock key="u" />}
      </div>
    </Stage>
  )
}

function Rail({ children }: { children: React.ReactNode }) {
  return (
    <aside className="flex w-[210px] shrink-0 flex-col border-r bg-muted/40 p-5">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Lock className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{VAULT.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {VAULT.count}개 · {formatBytes(VAULT.size)}
          </p>
        </div>
      </div>
      <div className="mt-8 flex-1">{children}</div>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        종단간 암호화
      </p>
    </aside>
  )
}

function Header({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-7 pt-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="닫기" data-testid="pg-vault-unlock-b-close" className="-mr-2 -mt-1">
        <X />
      </Button>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  invalid,
  testid,
  autoFocus,
  mono,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  invalid?: boolean
  testid: string
  autoFocus?: boolean
  mono?: boolean
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={mono ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        aria-invalid={invalid}
        placeholder={placeholder}
        data-testid={testid}
        className={cn(
          "mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:ring-3 focus:ring-ring/30",
          mono && "font-mono uppercase tracking-widest",
          invalid && "border-destructive focus:border-destructive focus:ring-destructive/20",
        )}
      />
    </label>
  )
}

const SETUP_STEPS = [
  { key: "password", label: "비밀번호" },
  { key: "recovery", label: "복구 코드" },
  { key: "confirm", label: "확인" },
] as const

function Setup() {
  const s = useSetup()
  const [check, setCheck] = useState("")
  const idx = s.step === "done" ? 3 : SETUP_STEPS.findIndex((x) => x.key === s.step)
  const target = RECOVERY_CODE.split("-")[2]
  const checkOk = check.toUpperCase() === target
  const checkBad = check.length >= 4 && !checkOk

  return (
    <>
      <Rail>
        <ol className="relative space-y-5">
          <span className="absolute bottom-2 left-[11px] top-2 w-px bg-border" />
          {SETUP_STEPS.map((st, i) => {
            const state = i < idx ? "done" : i === idx ? "now" : "next"
            return (
              <li key={st.key} className="relative flex items-center gap-3">
                <span
                  className={cn(
                    "relative grid size-6 place-items-center rounded-full border text-[11px] font-semibold transition-colors",
                    state === "done" && "border-primary bg-primary text-primary-foreground",
                    state === "now" && "border-primary bg-background text-foreground ring-4 ring-primary/15",
                    state === "next" && "border-border bg-background text-muted-foreground",
                  )}
                >
                  {state === "done" ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className={cn("text-sm", state === "next" ? "text-muted-foreground" : "font-medium")}>{st.label}</span>
              </li>
            )
          })}
        </ol>
      </Rail>

      <section className="flex flex-1 flex-col">
        {s.step === "password" && (
          <form
            className="flex flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault()
              s.create()
            }}
          >
            <Header title="암호화 비밀번호" sub="로그인 비밀번호와 별개" />
            <div className="flex-1 space-y-4 px-7 pt-6">
              <div>
                <Field label="비밀번호" value={s.pw} onChange={s.setPw} testid="pg-vault-unlock-b-setup-password" autoFocus />
                <div className="mt-2 flex items-center gap-3">
                  <StrengthBar value={s.strength} className="flex-1" />
                  <span className="w-8 text-right text-[11px] text-muted-foreground">{STRENGTH_LABEL[s.strength]}</span>
                </div>
              </div>
              <div>
                <Field label="비밀번호 확인" value={s.pw2} onChange={s.setPw2} invalid={s.mismatch} testid="pg-vault-unlock-b-setup-confirm" />
                <p className={cn("mt-1.5 text-xs text-destructive", !s.mismatch && "invisible")}>일치하지 않습니다</p>
              </div>
            </div>
            <Footer>
              <span className="text-[11px] text-muted-foreground">8자 이상</span>
              <Button type="submit" disabled={!s.canCreate} data-testid="pg-vault-unlock-b-setup-next" className="min-w-24">
                {s.busy ? (
                  <>
                    <Loader2 className="animate-spin" />
                    키 생성 중
                  </>
                ) : (
                  "다음"
                )}
              </Button>
            </Footer>
          </form>
        )}

        {s.step === "recovery" && (
          <>
            <Header title="복구 코드" sub="지금 한 번만 표시" />
            <div className="flex-1 px-7 pt-6">
              <RecoveryCode className="text-[15px] [&>span]:py-3" />
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" onClick={s.copy} data-testid="pg-vault-unlock-b-recovery-copy">
                  {s.copied ? <Check /> : <Copy />}
                  {s.copied ? "복사됨" : "복사"}
                </Button>
                <Button variant="outline" size="sm" onClick={s.download} data-testid="pg-vault-unlock-b-recovery-download">
                  <Download />
                  .txt 저장
                </Button>
              </div>
              <div className="mt-6 flex gap-2.5 rounded-lg bg-amber-50 px-3.5 py-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertCircle className="mt-px size-4 shrink-0" />
                비밀번호와 복구 코드를 모두 잃으면 열 수 없음
              </div>
            </div>
            <Footer>
              <Button variant="ghost" onClick={() => s.setStep("password")} data-testid="pg-vault-unlock-b-recovery-back">
                <ArrowLeft />
                뒤로
              </Button>
              <Button onClick={() => s.setStep("confirm")} data-testid="pg-vault-unlock-b-recovery-next" className="min-w-24">
                다음
              </Button>
            </Footer>
          </>
        )}

        {s.step === "confirm" && (
          <>
            <Header title="복구 코드 확인" sub="세 번째 묶음 입력" />
            <div className="flex-1 px-7 pt-6">
              <div className="grid grid-cols-5 gap-1.5 font-mono text-[15px] font-semibold tracking-wider">
                {RECOVERY_CODE.split("-").map((g, i) =>
                  i === 2 ? (
                    <input
                      key={i}
                      value={check}
                      onChange={(e) => setCheck(e.target.value.slice(0, 4))}
                      autoFocus
                      aria-invalid={checkBad}
                      data-testid="pg-vault-unlock-b-confirm-input"
                      className={cn(
                        "h-12 rounded-md border-2 border-dashed border-primary/50 bg-background text-center uppercase outline-none focus:border-solid focus:border-primary",
                        checkOk && "border-solid border-emerald-500 text-emerald-700 dark:text-emerald-300",
                        checkBad && "border-solid border-destructive text-destructive",
                      )}
                    />
                  ) : (
                    <span key={i} className="grid h-12 place-items-center rounded-md bg-muted text-muted-foreground/60">
                      {"•".repeat(4)}
                    </span>
                  ),
                )}
              </div>
              <p className={cn("mt-2 text-xs text-destructive", !checkBad && "invisible")}>일치하지 않습니다</p>
            </div>
            <Footer>
              <Button variant="ghost" onClick={() => s.setStep("recovery")} data-testid="pg-vault-unlock-b-confirm-back">
                <ArrowLeft />
                다시 보기
              </Button>
              <Button onClick={() => s.setStep("done")} disabled={!checkOk} data-testid="pg-vault-unlock-b-confirm-finish" className="min-w-24">
                완료
              </Button>
            </Footer>
          </>
        )}

        {s.step === "done" && (
          <>
            <Header title="" />
            <div className="flex flex-1 flex-col items-center justify-center pb-10 text-center">
              <span className="grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                <Check className="size-7" />
              </span>
              <h2 className="mt-4 text-lg font-semibold">설정 완료</h2>
              <Button className="mt-6 min-w-40" data-testid="pg-vault-unlock-b-done-open">
                {VAULT.name} 열기
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-muted-foreground"
                onClick={() => {
                  setCheck("")
                  s.reset()
                }}
                data-testid="pg-vault-unlock-b-done-restart"
              >
                처음으로
              </Button>
            </div>
          </>
        )}
      </section>
    </>
  )
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between border-t px-7 py-4">{children}</div>
}

const UNLOCK_PHASES = ["키 유도", "개인키 복호화", "폴더 키 확인"]

function Unlock() {
  const u = useUnlock()
  const [phase, setPhase] = useState(0)

  // 해제 중 단계 표시 (모양만)
  useEffect(() => {
    if (!u.busy) return
    const t = setInterval(() => setPhase((p) => Math.min(p + 1, UNLOCK_PHASES.length - 1)), 360)
    return () => {
      clearInterval(t)
      setPhase(0)
    }
  }, [u.busy])

  return (
    <>
      <Rail>
        <div className="space-y-1">
          {(
            [
              [false, "비밀번호"],
              [true, "복구 코드"],
            ] as const
          ).map(([rec, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => rec !== u.recovery && u.toggleRecovery()}
              data-testid={`pg-vault-unlock-b-method-${rec ? "recovery" : "password"}`}
              className={cn(
                "flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                rec === u.recovery ? "bg-background font-medium shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </Rail>
      <section className="flex flex-1 flex-col">
        <Header title={u.done ? "잠금 해제됨" : "잠금 해제"} sub={u.done ? undefined : u.recovery ? "복구 코드" : "암호화 비밀번호"} />
        {u.done ? (
          <div className="flex flex-1 flex-col items-center justify-center pb-10 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
              <Check className="size-7" />
            </span>
            <Button className="mt-6 min-w-40" data-testid="pg-vault-unlock-b-unlocked-open">
              {VAULT.name} 열기
            </Button>
            <Button variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={u.reset} data-testid="pg-vault-unlock-b-relock">
              다시 잠그기
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault()
              u.submit()
            }}
          >
            <div className="flex-1 px-7 pt-6">
              <Field
                key={u.recovery ? "r" : "p"}
                label={u.recovery ? "복구 코드" : "비밀번호"}
                value={u.value}
                onChange={u.setValue}
                invalid={!!u.error}
                testid="pg-vault-unlock-b-password"
                mono={u.recovery}
                placeholder={u.recovery ? "XXXX-XXXX-XXXX-XXXX-XXXX" : undefined}
                autoFocus
              />
              {u.error && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                  <AlertCircle className="size-3.5 shrink-0" />
                  {u.error}
                </div>
              )}
              {u.busy && (
                <ol className="mt-5 space-y-2">
                  {UNLOCK_PHASES.map((p, i) => (
                    <li key={p} className={cn("flex items-center gap-2 text-xs", i > phase ? "text-muted-foreground/50" : "text-muted-foreground")}>
                      {i < phase ? (
                        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : i === phase ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <span className="size-3.5 rounded-full border" />
                      )}
                      {p}
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <Footer>
              <span />
              <Button type="submit" disabled={!u.value || u.busy} data-testid="pg-vault-unlock-b-submit" className="min-w-24">
                {u.busy ? <Loader2 className="animate-spin" /> : null}
                잠금 해제
              </Button>
            </Footer>
          </form>
        )}
      </section>
    </>
  )
}
