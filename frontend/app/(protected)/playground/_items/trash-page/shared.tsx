"use client"

import { useMemo, useState } from "react"
import { Check, Minus } from "lucide-react"

import { useToast } from "@/components/ui-custom/use-toast"
import { cn } from "@/lib/utils"

import { NODES, TRASH } from "../_mock"

export { KindIcon } from "../activity-page/shared"

export type TrashItem = (typeof TRASH)[number]

export const RETENTION_DAYS = 30
const NOW = new Date("2026-10-10T17:00:00+09:00").getTime()

export function daysLeft(deletedAt: string): number {
  const passed = Math.floor((NOW - new Date(deletedAt).getTime()) / 86400_000)
  return Math.max(0, RETENTION_DAYS - passed)
}

/** 남은 기간 색: 7일 이하 rose, 14일 이하 amber */
export function urgency(left: number): { pill: string; bar: string; text: string } {
  if (left <= 7)
    return {
      pill: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
      bar: "bg-rose-500",
      text: "text-rose-600 dark:text-rose-400",
    }
  if (left <= 14)
    return {
      pill: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
      bar: "bg-amber-500",
      text: "text-amber-600 dark:text-amber-400",
    }
  return { pill: "bg-muted text-muted-foreground", bar: "bg-muted-foreground/40", text: "text-muted-foreground" }
}

export function thumbOf(item: TrashItem): string | undefined {
  return item.thumb ?? NODES.find((n) => n.name === item.name)?.thumb
}

export function useTrash() {
  const { toast } = useToast()
  const [items, setItems] = useState<TrashItem[]>(TRASH)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const sorted = useMemo(
    () => [...items].sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()),
    [items],
  )
  const totalSize = items.reduce((s, i) => s + i.size, 0)

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const toggleAll = () =>
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))))
  const clear = () => setSelected(new Set())

  const take = (ids: string[]) => {
    const removed = items.filter((i) => ids.includes(i.id))
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)))
    setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))))
    return removed
  }

  const restore = (ids: string[]) => {
    const removed = take(ids)
    const label = removed.length === 1 ? removed[0].name : `${removed.length}개 항목`
    toast.success(`${label} 복원`, {
      action: { label: "실행 취소", onClick: () => setItems((prev) => [...prev, ...removed]) },
    })
  }
  const purge = (ids: string[]) => {
    const removed = take(ids)
    toast(`${removed.length === 1 ? removed[0].name : `${removed.length}개 항목`} 영구 삭제`)
  }
  const emptyAll = () => purge(items.map((i) => i.id))
  const refill = () => setItems(TRASH)

  return { items: sorted, selected, totalSize, toggle, toggleAll, clear, restore, purge, emptyAll, refill }
}

export function CheckBox({ state, className }: { state: "on" | "off" | "some"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded border border-input bg-background transition-colors",
        state !== "off" && "border-primary bg-primary text-primary-foreground",
        className,
      )}
    >
      {state === "on" && <Check className="size-3" strokeWidth={3} />}
      {state === "some" && <Minus className="size-3" strokeWidth={3} />}
    </span>
  )
}
