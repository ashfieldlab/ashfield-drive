"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Eye, Pencil, ShieldCheck, Users } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { SharePermission } from "@/lib/types/api"

export const PERM_LABEL: Record<SharePermission, string> = { read: "보기", write: "편집", manage: "관리" }
const PERM_ICON: Record<SharePermission, typeof Eye> = { read: Eye, write: Pencil, manage: ShieldCheck }
const PERMS: SharePermission[] = ["read", "write", "manage"]

const PALETTE = ["#2563eb", "#d97706", "#db2777", "#7c3aed", "#0d9488", "#4f6b4a", "#dc2626", "#0891b2"]

/** sub 등 식별자로 고정 색 */
export function colorFor(seed: string): string {
  let h = 0
  for (const ch of seed) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

export function Avatar({
  seed,
  label,
  group,
  size = 32,
  className,
}: {
  seed: string
  label: string
  group?: boolean
  size?: number
  className?: string
}) {
  if (group) {
    return (
      <span
        className={cn("grid shrink-0 place-items-center rounded-full bg-muted text-muted-foreground", className)}
        style={{ width: size, height: size }}
      >
        <Users size={size * 0.45} />
      </span>
    )
  }
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full font-medium text-white", className)}
      style={{ width: size, height: size, background: colorFor(seed), fontSize: size * 0.4 }}
    >
      {(label || "?").slice(0, 1).toUpperCase()}
    </span>
  )
}

/** 권한 드롭다운. onRemove 가 있으면 "액세스 삭제" 항목 */
export function PermMenu({
  value,
  onChange,
  onRemove,
  testId,
  disabled,
  className,
  align = "end",
}: {
  value: SharePermission
  onChange: (p: SharePermission) => void
  onRemove?: () => void
  testId: string
  disabled?: boolean
  className?: string
  align?: "start" | "end"
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          data-testid={`${testId}-trigger`}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-sm text-foreground/80 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50 data-[state=open]:bg-muted",
            className,
          )}
        >
          {PERM_LABEL[value]}
          <ChevronDown size={14} className="text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-44">
        {PERMS.map((p) => {
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
  disabled,
  testId,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  testId: string
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      data-testid={testId}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50",
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

/** QR 느낌의 장식 패턴: 토큰으로 결정 (스캔용 아님) */
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
    <svg
      viewBox={`0 0 ${N} ${N}`}
      width={size}
      height={size}
      className="text-foreground"
      shapeRendering="crispEdges"
      aria-hidden
    >
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

/** 복사 후 잠깐 "복사됨" */
export function useCopied(ms = 1600) {
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
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
