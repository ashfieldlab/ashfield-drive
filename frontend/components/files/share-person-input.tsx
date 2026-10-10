"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, X } from "lucide-react"

import { api } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { logger } from "@/lib/utils/logger"
import { Avatar } from "@/components/files/share-parts"
import type { WorkspaceMember, WorkspaceMembersResponse } from "@/lib/types/api"

/**
 * 이름 또는 이메일 하나로 워크스페이스 멤버를 고른다 (디바운스 200ms).
 * 공유 API 는 grantee_sub 만 받으므로 멤버가 아닌 임의 이메일은 고를 수 없다.
 * 고른 멤버는 칩으로 쌓이고, 공유 버튼(또는 빈 입력에서 Enter)으로 한꺼번에 추가.
 */
export function SharePersonInput({
  staged,
  exclude,
  onStage,
  onUnstage,
  onSubmit,
  disabled,
}: {
  staged: WorkspaceMember[]
  exclude: string[]
  onStage: (m: WorkspaceMember) => void
  onUnstage: (sub: string) => void
  onSubmit: () => void
  disabled?: boolean
}) {
  const [text, setText] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [items, setItems] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const r = await api<WorkspaceMembersResponse>(
          `/api/v1/me/workspace/members?q=${encodeURIComponent(text.trim())}&limit=10`,
        )
        if (!cancelled) setItems(r.members)
      } catch (err) {
        logger.warn("share_member_search_failed", { category: "api", error: String(err) })
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [text, open])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("mousedown", onDown)
    return () => window.removeEventListener("mousedown", onDown)
  }, [open])

  const options = useMemo(() => {
    const ex = new Set([...exclude, ...staged.map((s) => s.sub)])
    return items.filter((m) => !ex.has(m.sub))
  }, [items, exclude, staged])

  function pick(m: WorkspaceMember) {
    onStage(m)
    setText("")
    setActive(0)
    inputRef.current?.focus()
  }

  const showList = open && (text.trim().length > 0 || options.length > 0 || loading)

  return (
    <div className="relative" ref={ref}>
      <div
        className={cn(
          "flex min-h-10 flex-wrap items-center gap-1 rounded-lg border border-input bg-background px-1.5 py-1 transition focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20",
          disabled && "opacity-60",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {staged.map((m) => (
          <span
            key={m.sub}
            data-testid={`share-staged-${m.sub}`}
            className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-muted pl-0.5 pr-1 text-xs"
          >
            <Avatar seed={m.sub} label={m.name ?? m.email} size={24} />
            <span className="truncate">{m.name ?? m.email}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onUnstage(m.sub)
              }}
              data-testid={`share-staged-${m.sub}-remove`}
              aria-label="빼기"
              className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setOpen(true)
              setActive((i) => Math.min(i + 1, options.length - 1))
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            } else if (e.key === "Enter") {
              e.preventDefault()
              const o = open && text.trim() ? options[active] : undefined
              if (o) pick(o)
              else if (!text.trim() && staged.length > 0) {
                setOpen(false)
                onSubmit()
              }
            } else if (e.key === "Escape") {
              if (open) {
                e.stopPropagation()
                setOpen(false)
              }
            } else if (e.key === "Backspace" && !text && staged.length > 0) {
              onUnstage(staged[staged.length - 1].sub)
            }
          }}
          placeholder={staged.length ? "" : "이름 또는 이메일"}
          data-testid="share-grantee-input"
          className="h-7 min-w-24 flex-1 bg-transparent px-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {showList && (
        <div
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10"
          data-testid="share-grantee-results"
        >
          {loading && options.length === 0 ? (
            <div className="flex justify-center py-2.5 text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
            </div>
          ) : options.length === 0 ? (
            <div className="px-2.5 py-2 text-xs text-muted-foreground">일치하는 멤버 없음</div>
          ) : (
            options.map((m, i) => (
              <button
                key={m.sub}
                type="button"
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
                data-testid={`user-autocomplete-option-${m.sub}`}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm",
                  i === active && "bg-accent text-accent-foreground",
                )}
              >
                <Avatar seed={m.sub} label={m.name ?? m.email} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.name ?? m.email}</span>
                  {m.name && <span className="block truncate text-xs text-muted-foreground">{m.email}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
