"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Mail, Send, Trash2 } from "lucide-react"
import { useToast } from "@/components/ui-custom/use-toast"

import { useAppContext } from "@/components/providers/app-context"
import { api } from "@/lib/api-client"
import { useConfirm } from "@/components/ui-custom/use-confirm"
import { invalidateApi, useApiGet } from "@/lib/hooks/use-api"

interface WorkspaceSmtpResponse {
  override_enabled: boolean
  host: string
  port: number
  smtp_user: string
  smtp_password: string
  tls_mode: "none" | "starttls" | "ssl"
  from_addr: string
  from_name: string
  effective_source: "workspace" | "system" | "env" | "none"
}

type TlsMode = "none" | "starttls" | "ssl"

export default function WorkspaceSmtpPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: workspaceIdRaw } = use(params)
  const workspaceId = decodeURIComponent(workspaceIdRaw)
  const { isWorkspaceAdmin } = useAppContext()
  const { toast } = useToast()
  const confirm = useConfirm()
  const URL = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/smtp`
  const { data, error, isLoading } = useApiGet<WorkspaceSmtpResponse>(
    isWorkspaceAdmin ? URL : null,
  )

  const [host, setHost] = useState("")
  const [port, setPort] = useState(587)
  const [smtpUser, setSmtpUser] = useState("")
  const [smtpPassword, setSmtpPassword] = useState("")
  const [tlsMode, setTlsMode] = useState<TlsMode>("starttls")
  const [fromAddr, setFromAddr] = useState("")
  const [fromName, setFromName] = useState("")
  const [busy, setBusy] = useState(false)
  const [testTo, setTestTo] = useState("")

  useEffect(() => {
    if (!data) return
    // override 비활성(전역, env 사용 중) 시엔 폼 공란으로: 사용자가 의식적으로 입력.
    if (!data.override_enabled) {
      setHost("")
      setPort(587)
      setSmtpUser("")
      setSmtpPassword("")
      setTlsMode("starttls")
      setFromAddr("")
      setFromName("")
      return
    }
    setHost(data.host)
    setPort(data.port || 587)
    setSmtpUser(data.smtp_user)
    setSmtpPassword(data.smtp_password)
    setTlsMode(data.tls_mode)
    setFromAddr(data.from_addr)
    setFromName(data.from_name)
  }, [data])

  if (!isWorkspaceAdmin) {
    return (
      <div
        className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-6 text-sm text-amber-800 dark:text-amber-200"
        data-testid="workspace-smtp-no-permission"
      >
        워크스페이스 관리자만 접근할 수 있습니다.
      </div>
    )
  }

  async function save() {
    setBusy(true)
    try {
      await api(URL, {
        method: "PUT",
        body: {
          host, port,
          smtp_user: smtpUser,
          smtp_password: smtpPassword,
          tls_mode: tlsMode,
          from_addr: fromAddr,
          from_name: fromName,
        },
      })
      toast.success("워크스페이스 SMTP 설정을 저장했습니다")
      invalidateApi(URL)
    } catch (e) {
      toast.error(`저장 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function removeOverride() {
    if (!(await confirm({ title: "SMTP 설정 삭제", description: "이 워크스페이스 전용 SMTP 를 삭제하고 공통 설정을 사용하시겠습니까?", confirmText: "삭제", variant: "destructive" }))) return
    setBusy(true)
    try {
      await api(URL, { method: "DELETE" })
      toast.success("워크스페이스 전용 SMTP 를 삭제했습니다")
      invalidateApi(URL)
    } catch (e) {
      toast.error(`삭제 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    if (!testTo) {
      toast.error("받는 주소를 입력하세요")
      return
    }
    setBusy(true)
    try {
      await api(`${URL}/test`, {
        method: "POST",
        body: { to: testTo },
      })
      toast.success("테스트 메일을 발송했습니다")
    } catch (e) {
      toast.error(`발송 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function checkConnection() {
    setBusy(true)
    try {
      await api(`${URL}/connection-test`, {
        method: "POST",
        body: {
          host, port,
          smtp_user: smtpUser,
          smtp_password: smtpPassword,
          tls_mode: tlsMode,
        },
      })
      toast.success("SMTP 서버 연결과 인증 성공")
    } catch (e) {
      toast.error(`연결 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="h-full overflow-y-auto px-4 py-8 sm:px-6 lg:px-8"
      data-testid="workspace-smtp-page"
    >
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        data-testid="workspace-smtp-back"
      >
        <ArrowLeft size={12} /> 설정으로
      </Link>
      <header className="mb-2 mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mail size={20} className="text-muted-foreground" />
          <h1 className="text-2xl font-bold text-foreground">
            {workspaceId} SMTP 설정
          </h1>
        </div>
      </header>

      {data && (
        <p className="mb-4 text-xs text-muted-foreground">
          {data.override_enabled
            ? "이 워크스페이스 전용 SMTP 사용 중"
            : data.effective_source === "none"
              ? "사용 가능한 SMTP 설정이 없습니다."
              : "공통 SMTP 설정 사용 중"}
        </p>
      )}

      {error ? (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-700 dark:text-rose-300">
          불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      ) : isLoading ? (
        <div className="text-sm text-muted-foreground">불러오는 중…</div>
      ) : (
        <div className="space-y-4 rounded-lg border border-border bg-card p-6">
          <Row label="Host">
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              data-testid="workspace-smtp-host-input"
              className="w-full rounded border border-input px-3 py-2 text-sm"
              placeholder="smtp.example.com"
            />
          </Row>
          <Row label="Port">
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              data-testid="workspace-smtp-port-input"
              className="w-full rounded border border-input px-3 py-2 text-sm"
            />
          </Row>
          <Row label="User">
            <input
              type="text"
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              data-testid="workspace-smtp-user-input"
              className="w-full rounded border border-input px-3 py-2 text-sm"
              autoComplete="off"
            />
          </Row>
          <Row label="Password" hint="마스킹(••••) 그대로 두면 미변경">
            <input
              type="password"
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              data-testid="workspace-smtp-password-input"
              className="w-full rounded border border-input px-3 py-2 text-sm"
              autoComplete="new-password"
            />
          </Row>
          <Row label="암호화" hint="STARTTLS=587 표준, SSL/TLS=465 implicit, 없음=평문(권장 X)">
            <select
              value={tlsMode}
              onChange={(e) => setTlsMode(e.target.value as TlsMode)}
              data-testid="workspace-smtp-tls-mode-input"
              className="w-full rounded border border-input px-3 py-2 text-sm"
            >
              <option value="starttls">STARTTLS (587)</option>
              <option value="ssl">SSL/TLS (465)</option>
              <option value="none">없음 (평문)</option>
            </select>
          </Row>
          <Row label="From Address">
            <input
              type="email"
              value={fromAddr}
              onChange={(e) => setFromAddr(e.target.value)}
              data-testid="workspace-smtp-from-addr-input"
              className="w-full rounded border border-input px-3 py-2 text-sm"
            />
          </Row>
          <Row label="From Name">
            <input
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              data-testid="workspace-smtp-from-name-input"
              className="w-full rounded border border-input px-3 py-2 text-sm"
            />
          </Row>

          <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
            {data?.override_enabled ? (
              <button
                onClick={removeOverride}
                disabled={busy}
                data-testid="workspace-smtp-remove-button"
                className="inline-flex items-center gap-1 rounded border border-rose-300 dark:border-rose-800 px-3 py-2 text-sm font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50"
              >
                <Trash2 size={12} /> 워크스페이스 전용 SMTP 삭제
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                onClick={checkConnection}
                disabled={busy || !host || !port}
                data-testid="workspace-smtp-connection-test-button"
                className="rounded border border-input bg-card px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-muted disabled:opacity-50"
                title="발송 없이 서버 연결과 인증만 확인"
              >
                연결 확인
              </button>
              <button
                onClick={save}
                disabled={busy || !host || !fromAddr}
                data-testid="workspace-smtp-save-button"
                className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                저장
              </button>
            </div>
          </div>

          <div className="mt-6 space-y-3 rounded border border-dashed border-input bg-muted/50 p-4">
            <div className="flex gap-2">
              <input
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="받는 주소"
                data-testid="workspace-smtp-test-to-input"
                className="flex-1 rounded border border-input px-3 py-2 text-sm"
              />
              <button
                onClick={sendTest}
                disabled={busy || !testTo}
                data-testid="workspace-smtp-test-send-button"
                className="inline-flex items-center gap-1 rounded border border-input bg-card px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-muted disabled:opacity-50"
              >
                <Send size={12} /> 테스트 발송
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {hint && <span className="ml-2 text-muted-foreground/70">{hint}</span>}
      </label>
      {children}
    </div>
  )
}
