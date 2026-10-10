"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { FlaskConical } from "lucide-react"

import { cn } from "@/lib/utils"

import { PLAYGROUND_ITEMS } from "../_items/registry"

export function PlaygroundNav() {
  const pathname = usePathname() ?? ""
  const params = useSearchParams()
  const groups = [...new Set(PLAYGROUND_ITEMS.map((i) => i.group))]

  return (
    <nav className="flex h-full w-56 shrink-0 flex-col gap-5 overflow-y-auto border-r bg-muted/30 p-3" data-testid="playground-nav">
      <div className="flex items-center gap-2 px-2 pt-1 text-sm font-semibold">
        <FlaskConical className="size-4 text-primary" />
        플레이그라운드
      </div>
      {groups.map((group) => (
        <div key={group} className="space-y-1">
          <p className="px-2 text-[11px] font-semibold tracking-wide text-muted-foreground">{group}</p>
          {PLAYGROUND_ITEMS.filter((i) => i.group === group).map((item) => {
            const active = pathname === `/playground/${item.slug}`
            const current = params.get("variant") ?? item.variants[0]?.key
            return (
              <div key={item.slug}>
                <Link
                  href={`/playground/${item.slug}`}
                  data-testid={`playground-item-${item.slug}`}
                  className={cn(
                    "block rounded-md px-2 py-1.5 text-sm",
                    active ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:bg-background/60",
                  )}
                >
                  {item.title}
                </Link>
                {active && (
                  <div className="mt-1 ml-2 space-y-0.5 border-l pl-2">
                    {item.variants.map((v) => (
                      <Link
                        key={v.key}
                        href={`/playground/${item.slug}?variant=${v.key}`}
                        replace
                        scroll={false}
                        data-testid={`playground-variant-${item.slug}-${v.key}`}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-1 text-xs",
                          current === v.key ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <span className="w-3 font-mono">{v.key}</span>
                        {v.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
