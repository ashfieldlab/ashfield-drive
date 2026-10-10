"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Check, ChevronDown, Eye, Mail, Pencil, ShieldCheck, UserPlus } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { LINK, ME, MEMBERS, NODES, SHARES, formatBytes } from "../_mock"

export const NODE = NODES.find((n) => n.id === "f-design")!
export const NODE_META = `폴더 · ${NODE.count}개 항목 · ${formatBytes(NODE.size)}`

export type Perm = "read" | "write" | "manage"
export type LinkPerm = "read" | "write"

export const PERM_LABEL: Record<Perm, string> = { read: "보기", write: "편집", manage: "관리" }
export const PERM_ICON: Record<Perm, typeof Eye> = { read: Eye, write: Pencil, manage: ShieldCheck }
export const PERMS: Perm[] = ["read", "write", "manage"]

export interface Candidate {
  email: string
  name?: string
  color?: string
  /** 워크스페이스 멤버면 id, 임의 이메일이면 없음 */
  memberId?: string
}

export interface Person extends Candidate {
  permission: Perm
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

// 사람 목록 로컬 상태
export function usePeople() {
  const [people, setPeople] = useState<Person[]>(() =>
    SHARES.map((s) => ({
      email: s.member.email,
      name: s.member.name,
      color: s.member.color,
      memberId: s.member.id,
      permission: s.permission,
    })),
  )
  const add = useCallback((cands: Candidate[], permission: Perm) => {
    setPeople((prev) => {
      const have = new Set(prev.map((p) => p.email))
      const next = cands.filter((c) => !have.has(c.email)).map((c) => ({ ...c, permission }))
      return [...next, ...prev]
    })
  }, [])
  const setPerm = useCallback((email: string, permission: Perm) => {
    setPeople((prev) => prev.map((p) => (p.email === email ? { ...p, permission } : p)))
  }, [])
  const remove = useCallback((email: string) => {
    setPeople((prev) => prev.filter((p) => p.email !== email))
  }, [])
  return { people, add, setPerm, remove }
}

// 외부 링크
export interface ShareLink {
  id: string
  url: string
  permission: LinkPerm
  expiryDays: number | null
  hasPassword: boolean
  downloads: number
}

export const EXPIRY_OPTIONS: { days: number | null; label: string }[] = [
  { days: null, label: "없음" },
  { days: 1, label: "1일" },
  { days: 7, label: "7일" },
  { days: 30, label: "30일" },
  { days: 90, label: "90일" },
]

const NOW = new Date("2026-10-10T17:00:00+09:00").getTime()

export function expiryDate(days: number | null): string {
  if (days == null) return "만료 없음"
  const t = new Date(NOW + days * 86400000)
  return `${t.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} 만료`
}

export const INITIAL_LINK: ShareLink = {
  id: "l1",
  url: LINK.url,
  permission: LINK.permission,
  expiryDays: 7,
  hasPassword: LINK.hasPassword,
  downloads: LINK.downloads,
}

const ALPHA = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
export function newLink(partial: Partial<ShareLink> = {}): ShareLink {
  let token = ""
  for (let i = 0; i < 11; i++) token += ALPHA[Math.floor(Math.random() * ALPHA.length)]
  return {
    id: token,
    url: `https://drive.ashfield.dev/s/${token}`,
    permission: "read",
    expiryDays: null,
    hasPassword: false,
    downloads: 0,
    ...partial,
  }
}

export const shortUrl = (url: string) => url.replace(/^https:\/\//, "")

// 복사 후 잠깐 "복사됨"
export function useCopied(ms = 1600) {
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const copy = useCallback(
    (text: string, key = text) => {
      void navigator.clipboard?.writeText(text).catch(() => {})
      setCopied(key)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(null), ms)
    },
    [ms],
  )
  return { copied, copy }
}

export function Avatar({
  person,
  size = 32,
  className,
}: {
  person: Candidate
  size?: number
  className?: string
}) {
  if (!person.memberId) {
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full border border-dashed border-input bg-muted text-muted-foreground",
          className,
        )}
        style={{ width: size, height: size }}
      >
        <Mail size={size * 0.45} />
      </span>
    )
  }
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full font-medium", className)}
      style={{ width: size, height: size, background: person.color, color: "#fff", fontSize: size * 0.4 }}
    >
      {(person.name ?? person.email).slice(0, 1).toUpperCase()}
    </span>
  )
}

export const OWNER: Candidate = { email: ME.email, name: ME.name, color: ME.color, memberId: ME.id }

/** 이름 또는 이메일 하나로: 멤버 자동완성 + 임의 이메일 */
export function PersonCombobox({
  exclude,
  onPick,
  testId,
  leading,
  onBackspaceEmpty,
  className,
  inputClassName,
  placeholder = "이름 또는 이메일",
  autoFocus,
}: {
  exclude: string[]
  onPick: (c: Candidate) => void
  testId: string
  leading?: ReactNode
  onBackspaceEmpty?: () => void
  className?: string
  inputClassName?: string
  placeholder?: string
  autoFocus?: boolean
}) {
  const [text, setText] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const options = useMemo<(Candidate & { invite?: boolean })[]>(() => {
    const q = text.trim().toLowerCase()
    const ex = new Set(exclude)
    const members = MEMBERS.filter(
      (m) =>
        m.id !== ME.id &&
        !ex.has(m.email) &&
        (!q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)),
    ).map((m) => ({ email: m.email, name: m.name, color: m.color, memberId: m.id }))
    const out: (Candidate & { invite?: boolean })[] = members
    if (isEmail(q) && !ex.has(q) && !MEMBERS.some((m) => m.email === q)) {
      out.push({ email: q, invite: true })
    }
    return out
  }, [text, exclude])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("mousedown", onDown)
    return () => window.removeEventListener("mousedown", onDown)
  }, [open])

  function pick(c: Candidate) {
    onPick({ email: c.email, name: c.name, color: c.color, memberId: c.memberId })
    setText("")
    setActive(0)
    inputRef.current?.focus()
  }

  const showList = open && (options.length > 0 || text.trim().length > 0)

  return (
    <div className="relative" ref={ref}>
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-input bg-background px-2 py-1 transition focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20",
          className,
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {leading}
        <input
          ref={inputRef}
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => {
            setText(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setActive((i) => Math.min(i + 1, options.length - 1))
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            } else if (e.key === "Enter") {
              e.preventDefault()
              const o = options[active]
              if (o) pick(o)
            } else if (e.key === "Escape") {
              setOpen(false)
            } else if (e.key === "Backspace" && !text) {
              onBackspaceEmpty?.()
            }
          }}
          placeholder={placeholder}
          data-testid={`${testId}-input`}
          className={cn(
            "h-7 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground",
            inputClassName,
          )}
        />
      </div>
      {showList && (
        <div
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10"
          data-testid={`${testId}-results`}
        >
          {options.length === 0 ? (
            <div className="px-2.5 py-2 text-xs text-muted-foreground">결과 없음</div>
          ) : (
            options.map((o, i) => (
              <button
                key={o.email}
                type="button"
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                data-testid={`${testId}-option-${o.memberId ?? "invite"}`}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm",
                  i === active && "bg-accent text-accent-foreground",
                )}
              >
                {o.invite ? (
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                    <UserPlus size={14} />
                  </span>
                ) : (
                  <Avatar person={o} size={28} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{o.invite ? o.email : o.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {o.invite ? "이메일로 초대" : o.email}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/** 권한 드롭다운. onRemove 가 있으면 "액세스 삭제" 항목 */
export function PermMenu({
  value,
  onChange,
  onRemove,
  testId,
  options = PERMS,
  className,
  align = "end",
}: {
  value: Perm
  onChange: (p: Perm) => void
  onRemove?: () => void
  testId: string
  options?: Perm[]
  className?: string
  align?: "start" | "end"
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid={`${testId}-trigger`}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-sm text-foreground/80 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 data-[state=open]:bg-muted",
            className,
          )}
        >
          {PERM_LABEL[value]}
          <ChevronDown size={14} className="text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-44">
        {options.map((p) => {
          const Icon = PERM_ICON[p]
          return (
            <DropdownMenuItem
              key={p}
              onSelect={() => onChange(p)}
              data-testid={`${testId}-${p}`}
              className="gap-2 py-1.5"
            >
              <Icon className="text-muted-foreground" />
              <span className="flex-1">{PERM_LABEL[p]}</span>
              {value === p && <Check />}
            </DropdownMenuItem>
          )
        })}
        {onRemove && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={onRemove}
              data-testid={`${testId}-remove`}
              className="py-1.5"
            >
              액세스 삭제
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Switch({
  checked,
  onChange,
  testId,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  testId: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      data-testid={testId}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
        checked ? "bg-primary" : "bg-input dark:bg-input/80",
      )}
    >
      <span
        className={cn(
          "inline-block size-4 rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  )
}

/** QR 느낌의 장식 패턴: 토큰으로 결정 */
export function QrPattern({ seed, size = 132 }: { seed: string; size?: number }) {
  const N = 21
  const cells = useMemo(() => {
    let h = 2166136261
    for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
    const out: boolean[] = []
    for (let i = 0; i < N * N; i++) {
      h ^= h << 13
      h ^= h >>> 17
      h ^= h << 5
      out.push((h >>> 0) % 100 < 46)
    }
    return out
  }, [seed])
  const finder = (x: number, y: number) => {
    for (const [fx, fy] of [
      [0, 0],
      [N - 7, 0],
      [0, N - 7],
    ]) {
      if (x >= fx && x < fx + 7 && y >= fy && y < fy + 7) {
        const dx = x - fx
        const dy = y - fy
        const ring = dx === 0 || dx === 6 || dy === 0 || dy === 6
        const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4
        return ring || core ? 1 : 0
      }
      if (x >= fx - 1 && x <= fx + 7 && y >= fy - 1 && y <= fy + 7) return 0
    }
    return -1
  }
  return (
    <svg viewBox={`0 0 ${N} ${N}`} width={size} height={size} className="text-foreground" shapeRendering="crispEdges">
      {cells.map((on, i) => {
        const x = i % N
        const y = Math.floor(i / N)
        const f = finder(x, y)
        const fill = f === -1 ? on : f === 1
        return fill ? <rect key={i} x={x} y={y} width={1} height={1} fill="currentColor" /> : null
      })}
    </svg>
  )
}
