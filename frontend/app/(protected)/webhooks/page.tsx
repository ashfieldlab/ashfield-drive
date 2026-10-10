"use client"

import { useState } from "react"
import { Copy, Trash2 } from "lucide-react"

import { api } from "@/lib/api-client"
import { useConfirm } from "@/components/ui-custom/use-confirm"
import { useAppContext } from "@/components/providers/app-context"
import { useApiGet } from "@/lib/hooks/use-api"
import { useToast } from "@/components/ui-custom/use-toast"
import { formatDateTime } from "@/lib/utils/format"

interface WebhookEndpoint {
  id: string
  url: string
  events: string[]
  active: boolean
  created_at: string
  secret: string | null
}
interface WebhookEndpointList {
  endpoints: WebhookEndpoint[]
}

interface WebhookDelivery {
  id: string
  endpoint_id: string
  event_type: string
  attempt: number
  status: string
  response_status: number | null
  error: string | null
  created_at: string
  delivered_at: string | null
}
interface WebhookDeliveryList {
  deliveries: WebhookDelivery[]
}

const SUPPORTED_EVENTS = ["node_shared", "node_unshared"]

export default function WebhooksPage() {
  const { isSystemAdmin } = useAppContext()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { data, mutate } = useApiGet<WebhookEndpointList>(
    isSystemAdmin ? "/api/v1/webhooks" : null,
  )
  const [url, setUrl] = useState("")
  const [events, setEvents] = useState<string[]>(["*"])
  const [busy, setBusy] = useState(false)
  const [showSecret, setShowSecret] = useState<{ id: string; secret: string } | null>(null)
  const [openDeliveries, setOpenDeliveries] = useState<string | null>(null)

  if (!isSystemAdmin) {
    return (
      <div
        className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800"
        data-testid="webhooks-no-permission"
      >
        Webhooks 설정은 관리자만 접근할 수 있습니다.
      </div>
    )
  }

  function toggleEvent(ev: string) {
    if (ev === "*") {
      setEvents(["*"])
      return
    }
    const filtered = events.filter((e) => e !== "*")
    setEvents(
      filtered.includes(ev) ? filtered.filter((e) => e !== ev) : [...filtered, ev],
    )
  }

  async function create() {
    if (!url.trim()) return
    setBusy(true)
    try {
      const created = await api<WebhookEndpoint>("/api/v1/webhooks", {
        method: "POST",
        body: { url: url.trim(), events: events.length ? events : ["*"] },
      })
      toast.success("Webhook을 생성했습니다. Secret은 한 번만 노출됩니다")
      setShowSecret({ id: created.id, secret: created.secret ?? "" })
      setUrl("")
      void mutate()
    } catch (e) {
      toast.error(`실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(ep: WebhookEndpoint) {
    try {
      await api(`/api/v1/webhooks/${ep.id}`, {
        method: "PATCH",
        body: { active: !ep.active },
      })
      void mutate()
    } catch (e) {
      toast.error(`실패: ${(e as Error).message}`)
    }
  }

  async function remove(ep: WebhookEndpoint) {
    if (!(await confirm({ title: "Webhook 삭제", description: `'${ep.url}' webhook 을 삭제하시겠습니까?`, confirmText: "삭제", variant: "destructive" }))) return
    try {
      await api(`/api/v1/webhooks/${ep.id}`, { method: "DELETE" })
      toast.success("삭제했습니다")
      void mutate()
    } catch (e) {
      toast.error(`실패: ${(e as Error).message}`)
    }
  }

  return (
    <div className="h-full overflow-y-auto space-y-6 px-4 py-8 sm:px-6 lg:px-8" data-testid="webhooks-page">
      <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>

      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">새 엔드포인트</h2>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-service/webhook"
          data-testid="webhook-url-input"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-600">구독할 이벤트</p>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={events.includes("*")}
                onChange={() => toggleEvent("*")}
                data-testid="webhook-event-all"
              />
              <span>전체 (*)</span>
            </label>
            {SUPPORTED_EVENTS.map((ev) => (
              <label key={ev} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={events.includes(ev)}
                  disabled={events.includes("*")}
                  onChange={() => toggleEvent(ev)}
                  data-testid={`webhook-event-${ev}`}
                />
                <span className="font-mono text-xs">{ev}</span>
              </label>
            ))}
          </div>
        </div>
        <button
          onClick={create}
          disabled={busy || !url.trim() || events.length === 0}
          data-testid="webhook-create-button"
          className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          생성
        </button>
      </section>

      {showSecret && (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 p-4"
          data-testid="webhook-secret-banner"
        >
          <p className="mb-2 text-sm font-semibold text-amber-900">
            Secret (다시 볼 수 없습니다). 지금 복사하세요.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded border border-amber-200 bg-white px-2 py-1 font-mono text-xs">
              {showSecret.secret}
            </code>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(showSecret.secret)
                toast.success("복사했습니다")
              }}
              data-testid="webhook-secret-copy"
              className="rounded p-1.5 text-amber-700 hover:bg-amber-100"
              title="복사"
            >
              <Copy size={14} />
            </button>
            <button
              onClick={() => setShowSecret(null)}
              data-testid="webhook-secret-dismiss"
              className="rounded px-2 py-1 text-xs text-amber-700 hover:bg-amber-100"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">등록된 엔드포인트</h2>
        {(data?.endpoints ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            등록된 webhook 이 없습니다.
          </div>
        ) : (
          <ul className="space-y-2">
            {data!.endpoints.map((ep) => (
              <li
                key={ep.id}
                data-testid={`webhook-row-${ep.id}`}
                className="rounded-lg border border-gray-200 bg-white"
              >
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm">{ep.url}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {ep.events.join(", ")} · {formatDateTime(ep.created_at)}
                    </p>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={ep.active}
                      onChange={() => toggleActive(ep)}
                      data-testid={`webhook-row-${ep.id}-active`}
                    />
                    활성
                  </label>
                  <button
                    onClick={() =>
                      setOpenDeliveries((curr) => (curr === ep.id ? null : ep.id))
                    }
                    data-testid={`webhook-row-${ep.id}-deliveries`}
                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    {openDeliveries === ep.id ? "닫기" : "최근 전송"}
                  </button>
                  <button
                    onClick={() => remove(ep)}
                    data-testid={`webhook-row-${ep.id}-delete`}
                    className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-rose-600"
                    title="삭제"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {openDeliveries === ep.id && <Deliveries endpointId={ep.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Deliveries({ endpointId }: { endpointId: string }) {
  const { data, isLoading } = useApiGet<WebhookDeliveryList>(
    `/api/v1/webhooks/${endpointId}/deliveries`,
  )
  if (isLoading) {
    return <div className="px-4 py-3 text-xs text-gray-500">불러오는 중…</div>
  }
  const rows = data?.deliveries ?? []
  if (rows.length === 0) {
    return (
      <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
        아직 전송 기록이 없습니다.
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
    <table className="w-full border-t border-gray-100 text-xs">
      <thead className="bg-gray-50 text-left text-gray-500">
        <tr>
          <th className="px-4 py-1.5 font-medium">시각</th>
          <th className="px-4 py-1.5 font-medium">이벤트</th>
          <th className="px-4 py-1.5 font-medium">상태</th>
          <th className="px-4 py-1.5 font-medium">응답</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((d) => (
          <tr key={d.id}>
            <td className="px-4 py-1 text-gray-600">{formatDateTime(d.created_at)}</td>
            <td className="px-4 py-1 font-mono">{d.event_type}</td>
            <td className="px-4 py-1">
              <span
                className={
                  d.status === "success"
                    ? "text-emerald-700"
                    : d.status === "failed"
                      ? "text-rose-700"
                      : "text-gray-700"
                }
              >
                {d.status}
              </span>
            </td>
            <td className="px-4 py-1 text-gray-600">
              {d.response_status ?? d.error ?? "-"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  )
}
