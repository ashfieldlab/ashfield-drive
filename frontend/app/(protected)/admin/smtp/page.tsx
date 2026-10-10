"use client"

import { useEffect, useState } from "react"
import { Mail, Send } from "lucide-react"
import { useToast } from "@/components/ui-custom/use-toast"

import { useAppContext } from "@/components/providers/app-context"
import { api } from "@/lib/api-client"
import { invalidateApi, useApiGet } from "@/lib/hooks/use-api"

interface SmtpConfigResponse {
  host: string
  port: number
  smtp_user: string
  smtp_password: string  // 마스킹 또는 빈 문자열
  tls_mode: "none" | "starttls" | "ssl"
  from_addr: string
  from_name: string
  source: "system" | "env" | "none"
}

type TlsMode = "none" | "starttls" | "ssl"

const URL = "/api/v1/admin/smtp"

export default function AdminSmtpPage() {
  const { isSystemAdmin } = useAppContext()
  const { toast } = useToast()
  const { data, error, isLoading } = useApiGet<SmtpConfigResponse>(
    isSystemAdmin ? URL : null,
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
    // env fallback 값(dev mailpit 등)이 운영 폼에 오염되지 않도록,
    // source==='env' 면 폼을 비워 사용자가 의식적으로 입력하게 한다.
    if (data.source === "env") {
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
    setPort(data.port)
    setSmtpUser(data.smtp_user)
    setSmtpPassword(data.smtp_password)  // 마스킹 그대로 폼에
    setTlsMode(data.tls_mode)
    setFromAddr(data.from_addr)
    setFromName(data.from_name)
  }, [data])

  if (!isSystemAdmin) {
    return (
      <div
        className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800"
        data-testid="admin-smtp-no-permission"
      >
        시스템 관리자만 접근할 수 있습니다.
      </div>
    )
  }

  async function save() {
    setBusy(true)
    try {
      await api(URL, {
        method: "PATCH",
        body: {
          host,
          port,
          smtp_user: smtpUser,
          smtp_password: smtpPassword,  // 마스킹값이면 백엔드가 미변경 처리
          tls_mode: tlsMode,
          from_addr: fromAddr,
          from_name: fromName,
        },
      })
      toast.success("SMTP 설정을 저장했습니다")
      invalidateApi(URL)
    } catch (e) {
      toast.error(`저장 실패: ${(e as Error).message}`)
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
      toast.success("SMTP 서버 연결·인증 성공")
    } catch (e) {
      toast.error(`연결 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="h-full overflow-y-auto px-4 py-8 sm:px-6 lg:px-8"
      data-testid="admin-smtp-page"
    >
      <header className="mb-4 flex items-center gap-2">
        <Mail size={20} className="text-gray-600" />
        <h1 className="text-2xl font-bold text-gray-900">전역 SMTP 설정</h1>
      </header>

      {data && data.source !== "system" && (
        <p className="mb-4 text-xs text-amber-700">
          아직 저장된 설정이 없습니다.
        </p>
      )}

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      ) : isLoading ? (
        <div className="text-sm text-gray-500">불러오는 중…</div>
      ) : (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
          <Row label="Host">
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              data-testid="admin-smtp-host-input"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="smtp.example.com"
            />
          </Row>
          <Row label="Port">
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              data-testid="admin-smtp-port-input"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </Row>
          <Row label="User">
            <input
              type="text"
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              data-testid="admin-smtp-user-input"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              autoComplete="off"
            />
          </Row>
          <Row label="Password" hint="마스킹(••••) 그대로 두면 미변경">
            <input
              type="password"
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              data-testid="admin-smtp-password-input"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              autoComplete="new-password"
            />
          </Row>
          <Row label="암호화" hint="STARTTLS=587 표준 · SSL/TLS=465 implicit · 없음=25/2525 평문(권장 X)">
            <select
              value={tlsMode}
              onChange={(e) => setTlsMode(e.target.value as TlsMode)}
              data-testid="admin-smtp-tls-mode-input"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
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
              data-testid="admin-smtp-from-addr-input"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="noreply@example.com"
            />
          </Row>
          <Row label="From Name">
            <input
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              data-testid="admin-smtp-from-name-input"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Ashfield"
            />
          </Row>

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button
              onClick={checkConnection}
              disabled={busy || !host || !port}
              data-testid="admin-smtp-connection-test-button"
              className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              title="발송 없이 서버 연결·인증만 확인"
            >
              연결 확인
            </button>
            <button
              onClick={save}
              disabled={busy || !host || !fromAddr}
              data-testid="admin-smtp-save-button"
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              저장
            </button>
          </div>

          <div className="mt-6 space-y-3 rounded border border-dashed border-gray-300 bg-gray-50 p-4">
            <div className="flex gap-2">
              <input
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="받는 주소"
                data-testid="admin-smtp-test-to-input"
                className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                onClick={sendTest}
                disabled={busy || !testTo}
                data-testid="admin-smtp-test-send-button"
                className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
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
      <label className="mb-1 block text-xs font-medium text-gray-600">
        {label}
        {hint && <span className="ml-2 text-gray-400">{hint}</span>}
      </label>
      {children}
    </div>
  )
}
