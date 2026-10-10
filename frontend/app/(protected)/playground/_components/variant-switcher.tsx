"use client"

// 플레이그라운드: ?variant= 로 안을 바꾸는 하단 바 (←/→ 키 지원).

import { useCallback, useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"

export interface PrototypeVariant {
  key: string
  name: string
}

export function usePrototypeVariant(variants: PrototypeVariant[]): string {
  const params = useSearchParams()
  const v = params.get("variant")
  return variants.some((x) => x.key === v) ? (v as string) : variants[0].key
}

export function PrototypeSwitcher({ variants }: { variants: PrototypeVariant[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const current = usePrototypeVariant(variants)
  const index = variants.findIndex((v) => v.key === current)

  const go = useCallback(
    (delta: number) => {
      const next = variants[(index + delta + variants.length) % variants.length]
      const sp = new URLSearchParams(params.toString())
      sp.set("variant", next.key)
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false })
    },
    [index, variants, params, pathname, router],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.closest("input, textarea, select, [contenteditable='true']"))) return
      if (e.key === "ArrowLeft") go(-1)
      if (e.key === "ArrowRight") go(1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go])

  return (
    <div className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-950 dark:bg-zinc-800 px-1.5 py-1.5 text-sm text-white shadow-2xl ring-1 ring-white/10">
      <button
        type="button"
        onClick={() => go(-1)}
        className="rounded-full p-1.5 hover:bg-white/15"
        aria-label="이전 안"
        data-testid="playground-switcher-prev"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-44 px-2 text-center font-medium tabular-nums">
        <span className="mr-1.5 rounded bg-amber-400 px-1.5 py-0.5 text-[11px] font-bold text-zinc-950">
          {current}
        </span>
        {variants[index]?.name}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        className="rounded-full p-1.5 hover:bg-white/15"
        aria-label="다음 안"
        data-testid="playground-switcher-next"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}
