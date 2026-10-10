"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { File, Folder, Search, X } from "lucide-react"

import { api } from "@/lib/api-client"
import type { NodeResponse } from "@/lib/types/api"

interface SearchResponse {
  nodes: NodeResponse[]
}

const KIND_OPTIONS: [string, string][] = [
  ["", "파일·폴더"],
  ["file", "파일만"],
  ["folder", "폴더만"],
]
const CATEGORY_OPTIONS: [string, string][] = [
  ["", "모든 종류"],
  ["image", "이미지"],
  ["document", "문서"],
  ["other", "기타"],
]

// 상세 검색 모달: 종류·수정일 필터. 제출식.
export function SearchModal({
  initialQuery,
  onClose,
}: {
  initialQuery: string
  onClose: () => void
}) {
  const [q, setQ] = useState(initialQuery)
  const [kind, setKind] = useState("")
  const [category, setCategory] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [data, setData] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // 포커스는 마운트 시 1회만: 부모 리렌더로 재실행되면 열린 select 에서
  // 포커스를 뺏어 닫히므로 deps 를 비운다.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function runSearch() {
    const term = q.trim()
    if (!term) return
    setLoading(true)
    setSearched(true)
    try {
      const p = new URLSearchParams({ q: term, limit: "50" })
      if (kind) p.set("kind", kind)
      if (category) p.set("category", category)
      if (from) p.set("modified_from", new Date(`${from}T00:00:00`).toISOString())
      if (to) p.set("modified_to", new Date(`${to}T23:59:59`).toISOString())
      setData(await api<SearchResponse>(`/api/v1/search?${p}`))
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  const results = data?.nodes ?? []

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 p-4 pt-[8vh]"
      // 누르기가 배경에서 "시작"됐을 때만 닫기: 네이티브 select 팝업이 닫히며
      // 흘리는 click 이나 안쪽 드래그가 배경에서 끝나도 모달이 닫히지 않게.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="flex max-h-[80vh] w-[560px] flex-col overflow-hidden rounded-lg bg-card shadow-xl dark:ring-1 dark:ring-foreground/10"
        data-testid="search-modal"
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">상세 검색</h3>
          <button
            onClick={onClose}
            data-testid="search-modal-close"
            className="rounded p-1 text-muted-foreground/70 hover:bg-muted hover:text-foreground/80"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2 border-b border-border/60 p-4">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70"
            />
            <input
              ref={inputRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="검색어"
              data-testid="search-modal-input"
              className="w-full rounded border border-input py-1.5 pl-8 pr-3 text-sm focus:border-ring focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  data-testid="search-modal-kind"
                  className="rounded border border-input px-2 py-1.5 text-xs focus:border-ring focus:outline-none"
                >
                  {KIND_OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={kind === "folder"}
                  data-testid="search-modal-category"
                  className="rounded border border-input px-2 py-1.5 text-xs focus:border-ring focus:outline-none disabled:opacity-50"
                >
                  {CATEGORY_OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              data-testid="search-modal-from"
              className="rounded border border-input px-2 py-1.5 text-xs focus:border-ring focus:outline-none"
              title="수정일 시작"
            />
            <span className="text-muted-foreground/70">~</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              data-testid="search-modal-to"
              className="rounded border border-input px-2 py-1.5 text-xs focus:border-ring focus:outline-none"
            />
            <button
              onClick={runSearch}
              disabled={loading || !q.trim()}
              data-testid="search-modal-submit"
              className="ml-auto rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "검색 중…" : "검색"}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!searched ? (
            <p className="p-8 text-center text-xs text-muted-foreground/70">
              검색어와 필터를 정하고 검색하세요.
            </p>
          ) : loading ? (
            <p className="p-8 text-center text-xs text-muted-foreground">검색 중…</p>
          ) : results.length === 0 ? (
            <p
              className="p-8 text-center text-xs text-muted-foreground"
              data-testid="search-modal-empty"
            >
              결과가 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {(data?.nodes ?? []).map((n) => (
                <li key={n.id}>
                  <Link
                    href={
                      n.kind === "folder"
                        ? `/files?scope=${n.scope}&folder=${n.id}`
                        : `/files?scope=${n.scope}`
                    }
                    onClick={onClose}
                    data-testid={`search-modal-node-${n.id}`}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/50"
                  >
                    {n.kind === "folder" ? (
                      <Folder size={14} className="shrink-0 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <File size={14} className="shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate text-foreground">{n.name}</span>
                    <span className="text-[11px] text-muted-foreground/70">
                      {n.scope === "shared" ? "공유" : "내 파일"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
