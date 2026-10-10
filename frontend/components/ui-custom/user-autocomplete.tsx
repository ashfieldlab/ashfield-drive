"use client"

import { useEffect, useRef, useState } from "react"

import { api } from "@/lib/api-client"
import type { WorkspaceMember, WorkspaceMembersResponse } from "@/lib/types/api"

interface Props {
  /** 선택된 sub */
  value: string
  onChange: (sub: string, member: WorkspaceMember | null) => void
  placeholder?: string
  testId?: string
}

/**
 * 워크스페이스 멤버 자동완성: 디바운스 200ms.
 *
 * 표시 ↔ 값 분리:
 *   - 입력 박스에는 사람이 보는 문자열(name, email)
 *   - 선택 후 hidden value 에 sub 저장
 *   - 빈 문자열 입력 시 onChange("", null) 호출 → grantee 클리어
 */
export function UserAutocomplete({
  value,
  onChange,
  placeholder = "이름 또는 이메일",
  testId,
}: Props) {
  const [text, setText] = useState("")
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!value) setText("")
  }, [value])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    setLoading(true)
    timer.current = setTimeout(async () => {
      try {
        const r = await api<WorkspaceMembersResponse>(
          `/api/v1/me/workspace/members?q=${encodeURIComponent(text)}&limit=10`,
        )
        setItems(r.members)
      } catch {
        setItems([])
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [text])

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("mousedown", onClick)
    return () => window.removeEventListener("mousedown", onClick)
  }, [open])

  function select(m: WorkspaceMember) {
    setText(m.name ? `${m.name} (${m.email})` : m.email)
    setOpen(false)
    onChange(m.sub, m)
  }

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
          if (!e.target.value) onChange("", null)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        data-testid={testId ?? "user-autocomplete-input"}
        className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/20"
      />
      {open && (
        <div
          data-testid={`${testId ?? "user-autocomplete"}-results`}
          className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg"
        >
          {loading ? (
            <div className="p-3 text-center text-xs text-muted-foreground">검색 중…</div>
          ) : items.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">
              일치하는 멤버가 없습니다.
            </div>
          ) : (
            <ul>
              {items.map((m) => (
                <li key={m.sub}>
                  <button
                    type="button"
                    onClick={() => select(m)}
                    data-testid={`user-autocomplete-option-${m.sub}`}
                    className="w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span className="block font-medium">
                      {m.name ?? m.email}
                    </span>
                    {m.name && (
                      <span className="block text-xs text-muted-foreground">{m.email}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
