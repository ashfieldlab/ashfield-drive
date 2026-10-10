"use client"

import { useState } from "react"

import { AppIcon } from "@/components/ui-custom/app-icon"
import { Button } from "@/components/ui/button"
import { APP } from "@/lib/apps"
import { authClient } from "@/lib/auth/client"

type Provider = "google" | "github"

interface Props {
  callbackUrl: string
  error?: string
  providers: Provider[]
  devPasswordLogin: boolean
}

const PROVIDER_LABEL: Record<Provider, string> = {
  google: "Google로 계속하기",
  github: "GitHub로 계속하기",
}

const ERROR_MESSAGE: Record<string, string> = {
  email_not_allowed: "허용되지 않은 이메일입니다. 관리자에게 문의하세요.",
  EMAIL_NOT_ALLOWED: "허용되지 않은 이메일입니다. 관리자에게 문의하세요.",
  access_denied: "로그인이 취소되었습니다.",
}

function errorText(code?: string): string | null {
  if (!code) return null
  return ERROR_MESSAGE[code] ?? "로그인 중 오류가 발생했습니다. 다시 시도해 주세요."
}

export default function LoginForm({ callbackUrl, error, providers, devPasswordLogin }: Props) {
  const [pending, setPending] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(errorText(error))

  async function social(provider: Provider) {
    setPending(provider)
    setMessage(null)
    const { error: err } = await authClient.signIn.social({
      provider,
      callbackURL: callbackUrl,
      errorCallbackURL: "/login",
    })
    // 성공하면 제공자 페이지로 이동하므로 여기 오는 건 실패뿐.
    if (err) {
      setMessage(errorText(err.code ?? "unknown"))
      setPending(null)
    }
  }

  const nothingConfigured = providers.length === 0 && !devPasswordLogin

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div
        className="w-full max-w-sm space-y-6 rounded-xl border bg-background p-8 shadow-sm"
        data-testid="login-page"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <AppIcon alt={APP.title} size={48} className="h-12 w-12 rounded-xl" />
          <h1 className="text-xl font-semibold">Ashfield {APP.title}</h1>
          <p className="text-sm text-muted-foreground">계정으로 로그인하세요.</p>
        </div>

        {message && (
          <div
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            data-testid="login-error-alert"
            role="alert"
          >
            {message}
          </div>
        )}

        {providers.length > 0 && (
          <div className="space-y-2">
            {providers.map((p) => (
              <Button
                key={p}
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                disabled={pending !== null}
                onClick={() => void social(p)}
                data-testid={`login-${p}-button`}
              >
                {PROVIDER_LABEL[p]}
              </Button>
            ))}
          </div>
        )}

        {devPasswordLogin && (
          <DevPasswordLogin
            callbackUrl={callbackUrl}
            disabled={pending !== null}
            onPending={setPending}
            onError={setMessage}
          />
        )}

        {nothingConfigured && (
          <p className="text-center text-sm text-muted-foreground" data-testid="login-not-configured">
            설정된 로그인 수단이 없습니다. GOOGLE_CLIENT_ID/SECRET 또는 GITHUB_CLIENT_ID/SECRET 을
            설정하세요.
          </p>
        )}
      </div>
    </div>
  )
}

/** 로컬·E2E 전용 (AUTH_DEV_PASSWORD_LOGIN=true, 비운영). 계정이 없으면 만들어서 로그인한다. */
function DevPasswordLogin({
  callbackUrl,
  disabled,
  onPending,
  onError,
}: {
  callbackUrl: string
  disabled: boolean
  onPending: (v: string | null) => void
  onError: (v: string | null) => void
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    onPending("dev")
    onError(null)
    let { error } = await authClient.signIn.email({ email, password })
    if (error && error.status === 401) {
      // 처음 쓰는 이메일 → 가입(자동 로그인).
      ;({ error } = await authClient.signUp.email({
        email,
        password,
        name: name.trim() || email.split("@")[0],
      }))
    }
    if (error) {
      onError(errorText(error.code ?? "unknown"))
      onPending(null)
      return
    }
    // 하드 내비게이션으로 가드를 다시 태운다.
    window.location.assign(callbackUrl)
  }

  const inputClass =
    "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

  return (
    <form onSubmit={submit} className="space-y-2 border-t pt-4" data-testid="login-dev-form">
      <div className="text-xs font-medium text-amber-700">DEV — 이메일·비밀번호 로그인</div>
      <input
        type="email"
        required
        placeholder="이메일"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputClass}
        data-testid="login-dev-email-input"
      />
      <input
        type="password"
        required
        minLength={8}
        placeholder="비밀번호 (8자 이상)"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={inputClass}
        data-testid="login-dev-password-input"
      />
      <input
        type="text"
        placeholder="이름 (처음 가입 시)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={inputClass}
        data-testid="login-dev-name-input"
      />
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={disabled}
        data-testid="login-dev-submit-button"
      >
        로그인
      </Button>
    </form>
  )
}
