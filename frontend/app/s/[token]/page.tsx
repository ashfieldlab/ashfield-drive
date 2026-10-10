"use client"

import { use, useEffect, useState } from "react"
import { Download, Lock } from "lucide-react"

import { formatBytes } from "@/lib/utils/format"

interface PublicNodeMeta {
  node_id: string
  name: string
  kind: "file" | "folder"
  size_bytes: number | null
  mime: string | null
  permission: "read" | "write"
  requires_password: boolean
}

export default function ExternalLinkPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = use(params)
  const [data, setData] = useState<PublicNodeMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/external/${token}`)
      .then(async (r) => {
        if (cancelled) return
        if (!r.ok) {
          setNotFound(true)
          return
        }
        setData(await r.json())
      })
      .catch(() => {
        if (!cancelled) setNotFound(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (loading) {
    return <Shell><p className="text-sm text-muted-foreground">불러오는 중…</p></Shell>
  }
  if (notFound || !data) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-foreground">
          링크를 찾을 수 없습니다
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          만료되었거나 철회된 링크일 수 있습니다.
        </p>
      </Shell>
    )
  }
  return <Body token={token} meta={data} />
}

function Body({ token, meta }: { token: string; meta: PublicNodeMeta }) {
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function download() {
    setBusy(true)
    setErr(null)
    try {
      const r = await fetch(`/api/external/${token}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password || null }),
      })
      if (r.status === 401) {
        setErr("비밀번호가 올바르지 않습니다.")
        return
      }
      if (!r.ok) {
        setErr(`다운로드 실패 (${r.status})`)
        return
      }
      const { url } = (await r.json()) as { url: string }
      window.location.href = url
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <div className="text-center" data-testid="external-link-page">
        <h1 className="break-all text-lg font-semibold text-foreground">{meta.name}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {meta.kind === "file" ? formatBytes(meta.size_bytes) : "폴더"}
          {meta.mime && `, ${meta.mime}`}
        </p>

        {meta.requires_password && (
          <div className="mt-5 space-y-2 rounded border border-border bg-muted/50 p-4 text-left">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground/80">
              <Lock size={14} />
              비밀번호로 보호된 링크
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              data-testid="external-link-password-input"
              className="w-full rounded border border-input px-3 py-2 text-sm focus:border-ring focus:outline-none"
            />
          </div>
        )}

        {err && (
          <div className="mt-3 rounded border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            {err}
          </div>
        )}

        <button
          onClick={download}
          disabled={busy || meta.kind !== "file"}
          data-testid="external-link-download-button"
          className="mt-5 inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Download size={14} />
          {busy ? "준비 중…" : "다운로드"}
        </button>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4 dark:bg-background">
      <div className="w-[420px] max-w-full rounded-lg border border-border bg-card p-8 shadow-sm">
        {children}
      </div>
    </div>
  )
}
