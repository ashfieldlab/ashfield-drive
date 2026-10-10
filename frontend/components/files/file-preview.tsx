"use client"

import { useEffect, useState } from "react"
import { Download, X } from "lucide-react"

import { api } from "@/lib/api-client"
import type { DownloadUrlResponse, NodeResponse } from "@/lib/types/api"

interface Props {
  node: NodeResponse
  onClose: () => void
}

type PreviewKind = "image" | "pdf" | "text" | "unsupported"

function previewKind(mime: string | null): PreviewKind {
  if (!mime) return "unsupported"
  if (mime.startsWith("image/")) return "image"
  if (mime === "application/pdf") return "pdf"
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/javascript"
  )
    return "text"
  return "unsupported"
}

export function isPreviewable(node: NodeResponse): boolean {
  return node.kind === "file" && previewKind(node.mime) !== "unsupported"
}

/**
 * 인라인 미리보기 모달.
 *
 * presigned URL 은 mount 시 새로 발급(짧은 TTL) → 페이지 HTML 에 박혀도 곧 만료.
 * referrerPolicy=no-referrer → URL 이 외부 Referer 로 새지 않음.
 */
export function FilePreview({ node, onClose }: Props) {
  const kind = previewKind(node.mime)
  const [url, setUrl] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let aborted = false
    async function load() {
      try {
        const res = await api<DownloadUrlResponse>(
          `/api/v1/nodes/${node.id}/download-url?purpose=preview`,
          { method: "POST" },
        )
        if (aborted) return
        setUrl(res.url)
        if (kind === "text") {
          const r = await fetch(res.url, { referrerPolicy: "no-referrer" })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const body = await r.text()
          if (!aborted) setText(body.slice(0, 200_000))
        }
      } catch (e) {
        if (!aborted) setError((e as Error).message)
      }
    }
    void load()
    return () => {
      aborted = true
    }
  }, [node.id, kind])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function downloadOriginal() {
    try {
      const res = await api<DownloadUrlResponse>(
        `/api/v1/nodes/${node.id}/download-url`,
        { method: "POST" },
      )
      window.open(res.url, "_blank", "noopener")
    } catch {
      // download 실패는 상위가 토스트로 처리하지 않음: 미리보기 모달은 viewer.
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      data-testid="file-preview"
    >
      <div
        className="flex h-[90vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-lg bg-card shadow-xl dark:ring-1 dark:ring-foreground/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3
            className="truncate text-sm font-semibold text-foreground"
            title={node.name}
          >
            {node.name}
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={downloadOriginal}
              data-testid="file-preview-download"
              title="다운로드"
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Download size={16} />
            </button>
            <button
              onClick={onClose}
              data-testid="file-preview-close"
              title="닫기"
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/50">
          {error && (
            <p
              className="px-4 text-sm text-rose-600 dark:text-rose-400"
              data-testid="file-preview-error"
            >
              미리보기를 불러올 수 없습니다: {error}
            </p>
          )}
          {!error && !url && (
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          )}
          {!error && url && kind === "image" && (
            // next/image 는 presigned URL 짧은 만료(10~30s) + 외부 도메인 프록시 와 안 맞음.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={node.name}
              referrerPolicy="no-referrer"
              data-testid="file-preview-image"
              className="max-h-full max-w-full object-contain"
            />
          )}
          {!error && url && kind === "pdf" && (
            <iframe
              src={url}
              referrerPolicy="no-referrer"
              data-testid="file-preview-pdf"
              className="h-full w-full border-0 bg-card"
              title={node.name}
            />
          )}
          {!error && url && kind === "text" && (
            <pre
              data-testid="file-preview-text"
              className="m-0 h-full w-full overflow-auto whitespace-pre-wrap bg-card p-4 font-mono text-xs text-foreground"
            >
              {text ?? "불러오는 중…"}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
