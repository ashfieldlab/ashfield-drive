"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { File, Folder, Search } from "lucide-react"

import { api } from "@/lib/api-client"
import { APP } from "@/lib/apps"
import { SearchModal } from "@/components/layout/search-modal"
import type {
  NodeResponse,
} from "@/lib/types/api"

interface SearchResponse {
  nodes: NodeResponse[]
}

export function GlobalSearch() {
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<SearchResponse | null>(null)
  const [showModal, setShowModal] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const term = q.trim()
    if (term.length < 1) {
      setData(null)
      return
    }
    setLoading(true)
    timer.current = setTimeout(async () => {
      try {
        const result = await api<SearchResponse>(
          `/api/v1/search?q=${encodeURIComponent(term)}&limit=10`,
        )
        setData(result)
      } catch {
        setData(null)
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [q])

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("mousedown", onClick)
    return () => window.removeEventListener("mousedown", onClick)
  }, [open])

  const hasResults = !!data && data.nodes.length > 0

  return (
    <div className="relative hidden w-64 sm:block" ref={ref}>
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={`${APP.title} 검색`}
          data-testid="global-search-input"
          className="w-full rounded border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-gray-500 focus:outline-none"
        />
      </div>
      {open && q.trim().length > 0 && (
        <div
          data-testid="global-search-results"
          className="absolute right-0 z-50 mt-1 w-[360px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {loading ? (
            <div className="p-4 text-center text-xs text-gray-500">검색 중…</div>
          ) : !hasResults ? (
            <div className="p-4 text-center text-xs text-gray-500">
              결과가 없습니다.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {data!.nodes.length > 0 && (
                <Section title="파일">
                  {data!.nodes.map((n) => (
                    <Link
                      key={n.id}
                      href={
                        n.kind === "folder"
                          ? `/files?scope=${n.scope}&folder=${n.id}`
                          : `/files?scope=${n.scope}`
                      }
                      onClick={() => setOpen(false)}
                      data-testid={`global-search-node-${n.id}`}
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      {n.kind === "folder" ? (
                        <Folder size={14} className="text-blue-600" />
                      ) : (
                        <File size={14} className="text-gray-500" />
                      )}
                      <span className="flex-1 truncate text-gray-900">{n.name}</span>
                      <span className="text-[11px] text-gray-400">
                        {n.scope === "shared" ? "공유" : "내 파일"}
                      </span>
                    </Link>
                  ))}
                </Section>
              )}
            </div>
          )}
          <button
            onClick={() => {
              setShowModal(true)
              setOpen(false)
            }}
            data-testid="global-search-advanced"
            className="block w-full border-t border-gray-100 px-3 py-2 text-center text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900"
          >
            상세 검색
          </button>
        </div>
      )}
      {showModal && (
        <SearchModal
          initialQuery={q}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="border-b border-gray-100 bg-gray-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </p>
      {children}
    </div>
  )
}
