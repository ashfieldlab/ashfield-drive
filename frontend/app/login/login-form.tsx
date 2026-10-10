"use client"

import { useState } from "react"
import { ArrowRight, Loader2 } from "lucide-react"

import { AppIcon } from "@/components/ui-custom/app-icon"
import { Button } from "@/components/ui/button"
import { APP } from "@/lib/apps"
import { authClient } from "@/lib/auth/client"

/** lib/auth/server.ts 의 ACCOUNT_PROVIDER_ID (서버 모듈이라 클라이언트에서 import 하지 않음). */
const ACCOUNT_PROVIDER_ID = "ashfield"

interface Props {
  callbackUrl: string
  error?: string
  /** 계정 서버 디스커버리 성공 여부: false 면 버튼 대신 안내. */
  accountReady: boolean
}

const ERROR_MESSAGE: Record<string, string> = {
  access_denied: "로그인이 취소되었습니다.",
  account_not_linked: "이 이메일로 이미 다른 방식의 계정이 있습니다. 관리자에게 문의하세요.",
  email_not_verified: "이메일 인증이 필요합니다. Ashfield 계정에서 이메일을 확인해 주세요.",
  state_mismatch: "로그인 세션이 만료되었습니다. 다시 시도해 주세요.",
  please_restart_the_process: "로그인 세션이 만료되었습니다. 다시 시도해 주세요.",
}

function errorText(code?: string): string | null {
  if (!code) return null
  return ERROR_MESSAGE[code] ?? "로그인 중 오류가 발생했습니다. 다시 시도해 주세요."
}

export default function LoginForm({ callbackUrl, error, accountReady }: Props) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(errorText(error))

  async function signIn() {
    setPending(true)
    setMessage(null)
    const { error: err } = await authClient.signIn.social({
      provider: ACCOUNT_PROVIDER_ID,
      callbackURL: callbackUrl,
      errorCallbackURL: "/login",
    })
    // 성공하면 계정 서버로 이동하므로 여기 오는 건 실패뿐.
    if (err) {
      setMessage(errorText(err.code ?? "unknown"))
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 dark:bg-background">
      <div
        className="w-full max-w-sm space-y-7 rounded-2xl border bg-card p-8 shadow-sm"
        data-testid="login-page"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <AppIcon alt={APP.title} size={56} className="h-14 w-14 rounded-2xl" />
          <h1 className="text-xl font-semibold tracking-tight">Ashfield {APP.title}</h1>
        </div>

        {message && (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            data-testid="login-error-alert"
            role="alert"
          >
            {message}
          </div>
        )}

        {accountReady ? (
          <Button
            type="button"
            size="lg"
            className="h-11 w-full gap-2 text-[15px]"
            disabled={pending}
            onClick={() => void signIn()}
            data-testid="login-ashfield-button"
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Ashfield 계정으로 로그인
            {!pending && <ArrowRight className="size-4 opacity-70" aria-hidden />}
          </Button>
        ) : (
          <div
            className="rounded-lg border border-amber-300/60 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-200"
            data-testid="login-account-unavailable"
            role="alert"
          >
            Ashfield 계정 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.
          </div>
        )}

      </div>
    </div>
  )
}
