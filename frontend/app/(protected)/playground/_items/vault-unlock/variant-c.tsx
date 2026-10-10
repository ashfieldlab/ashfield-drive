"use client"

import { useState } from "react"
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  FileImage,
  FileText,
  KeyRound,
  Loader2,
  Lock,
  LockOpen,
  MoreHorizontal,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { formatBytes, relativeTime } from "../_mock"
import { RecoveryCode, Stage, StrengthBar, useSetup, useUnlock, VAULT, VAULT_FILES, type VaultMode } from "./shared"

/** C: 흐려진 폴더 위에 떠 있는 잠금 카드 */
export function VariantC() {
  const [mode, setMode] = useState<VaultMode>("unlock")
  return (
    <Stage mode={mode} onMode={setMode}>
      {mode === "unlock" ? <UnlockWindow key="u" /> : <SetupWindow key="s" />}
    </Stage>
  )
}

function Window({ open, onLock, children }: { open: boolean; onLock?: () => void; children?: React.ReactNode }) {
  return (
    <div className="relative h-[520px] w-[800px] max-w-[94vw] overflow-hidden rounded-xl border bg-background shadow-2xl" data-testid="pg-vault-unlock-c">
      <div className="flex h-12 items-center gap-2 border-b px-4 text-sm">
        <span className="text-muted-foreground">내 파일</span>
        <ChevronRight className="size-3.5 text-muted-foreground" />
        <span className="font-medium">{VAULT.name}</span>
        <span
          className={cn(
            "ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
            open
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
              : "bg-muted text-muted-foreground",
          )}
        >
          {open ? <LockOpen className="size-3" /> : <Lock className="size-3" />}
          {open ? "해제됨" : "잠김"}
        </span>
        <div className="flex-1" />
        {open && onLock && (
          <Button variant="outline" size="sm" onClick={onLock} data-testid="pg-vault-unlock-c-lock">
            <Lock />
            잠그기
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" aria-label="닫기" data-testid="pg-vault-unlock-c-close">
          <X />
        </Button>
      </div>

      {/* 뒤쪽 파일 목록: 잠겨 있으면 흐리게 */}
      <div
        className={cn(
          "transition-[filter,opacity] duration-700",
          open ? "blur-0 opacity-100" : "pointer-events-none select-none opacity-70 blur-[7px]",
        )}
        aria-hidden={!open}
      >
        <div className="grid grid-cols-[1fr_120px_90px_36px] border-b px-4 py-2 text-xs text-muted-foreground">
          <span>이름</span>
          <span>수정</span>
          <span className="text-right">크기</span>
          <span />
        </div>
        {VAULT_FILES.map((f, i) => (
          <div key={f.name} className="group grid grid-cols-[1fr_120px_90px_36px] items-center border-b border-border/60 px-4 py-2.5 text-sm hover:bg-muted/50">
            <span className="flex min-w-0 items-center gap-3">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-md",
                  f.kind === "pdf" && "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300",
                  f.kind === "doc" && "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300",
                  f.kind === "image" && "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300",
                )}
              >
                {f.kind === "image" ? <FileImage className="size-3.5" /> : <FileText className="size-3.5" />}
              </span>
              <span className="truncate">{f.name}</span>
            </span>
            <span className="text-xs text-muted-foreground">{relativeTime(new Date(Date.parse(VAULT.updatedAt) - i * 86400_000 * 3).toISOString())}</span>
            <span className="text-right text-xs tabular-nums text-muted-foreground">{formatBytes(f.size)}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              className="justify-self-end opacity-0 group-hover:opacity-100"
              aria-label="더 보기"
              tabIndex={open ? 0 : -1}
              data-testid={`pg-vault-unlock-c-row-${i}-menu`}
            >
              <MoreHorizontal />
            </Button>
          </div>
        ))}
      </div>

      {/* 잠금 카드 */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 top-12 grid place-items-center bg-gradient-to-b from-background/30 to-background/70 transition-opacity duration-500",
          open && "pointer-events-none opacity-0",
        )}
      >
        {children}
      </div>
    </div>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("w-[320px] rounded-2xl border bg-background/95 p-6 shadow-xl backdrop-blur", className)}>{children}</div>
}

function UnlockWindow() {
  const u = useUnlock()
  return (
    <Window open={u.done} onLock={u.reset}>
      <Card className={cn(u.error && "animate-[pg-shake-c_0.35s]")}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            u.submit()
          }}
        >
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Lock className="size-4.5" />
            </span>
            <div>
              <p className="text-sm font-semibold">{VAULT.name}</p>
              <p className="text-xs text-muted-foreground">{VAULT.count}개 항목</p>
            </div>
          </div>
          <div className="relative mt-5">
            <input
              key={u.recovery ? "r" : "p"}
              type={u.recovery ? "text" : "password"}
              value={u.value}
              onChange={(e) => u.setValue(e.target.value)}
              placeholder={u.recovery ? "복구 코드" : "암호화 비밀번호"}
              autoFocus
              aria-invalid={!!u.error}
              disabled={u.busy}
              data-testid="pg-vault-unlock-c-password"
              className={cn(
                "h-10 w-full rounded-lg border border-input bg-background pl-3 pr-11 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/30 disabled:opacity-60",
                u.recovery && "font-mono uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal",
                u.error && "border-destructive focus:border-destructive focus:ring-destructive/20",
              )}
            />
            <Button
              type="submit"
              size="icon-sm"
              disabled={!u.value || u.busy}
              className="absolute right-1.5 top-1.5"
              aria-label="잠금 해제"
              data-testid="pg-vault-unlock-c-submit"
            >
              {u.busy ? <Loader2 className="animate-spin" /> : <ChevronRight />}
            </Button>
          </div>
          <div className="mt-2 flex h-4 items-center justify-between text-xs">
            <span className="text-destructive">{u.error}</span>
            <button
              type="button"
              onClick={u.toggleRecovery}
              data-testid="pg-vault-unlock-c-recovery-toggle"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <KeyRound className="size-3" />
              {u.recovery ? "비밀번호" : "복구 코드"}
            </button>
          </div>
        </form>
        <style>{`@keyframes pg-shake-c{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}`}</style>
      </Card>
    </Window>
  )
}

function SetupWindow() {
  const s = useSetup()
  const open = s.step === "done"
  return (
    <Window open={open} onLock={s.reset}>
      {s.step === "recovery" || s.step === "confirm" ? (
        <Card className="w-[380px]">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300">
              <KeyRound className="size-4.5" />
            </span>
            <div>
              <p className="text-sm font-semibold">복구 코드</p>
              <p className="text-xs text-muted-foreground">지금 한 번만 표시</p>
            </div>
          </div>
          <RecoveryCode className="mt-5 text-[13px]" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={s.copy} data-testid="pg-vault-unlock-c-recovery-copy">
              {s.copied ? <Check /> : <Copy />}
              {s.copied ? "복사됨" : "복사"}
            </Button>
            <Button variant="outline" size="sm" onClick={s.download} data-testid="pg-vault-unlock-c-recovery-download">
              <Download />
              .txt 저장
            </Button>
          </div>
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={s.saved}
              onChange={(e) => s.setSaved(e.target.checked)}
              data-testid="pg-vault-unlock-c-recovery-saved"
              className="size-3.5 accent-primary"
            />
            보관했습니다
          </label>
          <Button className="mt-4 w-full" disabled={!s.saved} onClick={() => s.setStep("done")} data-testid="pg-vault-unlock-c-recovery-done">
            폴더 열기
          </Button>
        </Card>
      ) : (
        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              s.create()
            }}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
                <Lock className="size-4.5" />
              </span>
              <div>
                <p className="text-sm font-semibold">보안 폴더 설정</p>
                <p className="text-xs text-muted-foreground">암호화 비밀번호</p>
              </div>
            </div>
            <input
              type="password"
              value={s.pw}
              onChange={(e) => s.setPw(e.target.value)}
              placeholder="8자 이상"
              autoFocus
              data-testid="pg-vault-unlock-c-setup-password"
              className="mt-5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/30"
            />
            <StrengthBar value={s.strength} className="mt-2" />
            <input
              type="password"
              value={s.pw2}
              onChange={(e) => s.setPw2(e.target.value)}
              placeholder="다시 입력"
              aria-invalid={s.mismatch}
              data-testid="pg-vault-unlock-c-setup-confirm"
              className={cn(
                "mt-3 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/30",
                s.mismatch && "border-destructive focus:border-destructive focus:ring-destructive/20",
              )}
            />
            <p className={cn("mt-1.5 h-4 text-xs text-destructive", !s.mismatch && "invisible")}>일치하지 않습니다</p>
            <Button type="submit" className="mt-2 w-full" disabled={!s.canCreate} data-testid="pg-vault-unlock-c-setup-submit">
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
        </Card>
      )}
    </Window>
  )
}
