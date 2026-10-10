"use client"

import { useState } from "react"
import { LayoutGrid, List } from "lucide-react"

import { cn } from "@/lib/utils"
import { Breadcrumb, NewMenu, SortMenu, T, useDrive } from "./shared"
import { DetailPanel, FilesToolbar, ListTable, activeNode } from "./variant-a"
import { Gallery } from "./variant-b"

type View = "list" | "grid"

const VIEWS: { key: View; label: string; icon: typeof List }[] = [
  { key: "list", label: "목록", icon: List },
  { key: "grid", label: "갤러리", icon: LayoutGrid },
]

// A + B: 목록/갤러리 전환, 상세 패널은 둘 다 공통
export function VariantD() {
  const drive = useDrive()
  const [view, setView] = useState<View>("list")
  const [activeId, setActiveId] = useState<string | null>("n-plan")
  const active = activeNode(drive, activeId)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <Breadcrumb drive={drive} big className="-ml-1.5" />
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border p-0.5" role="radiogroup" aria-label="보기">
            {VIEWS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={view === key}
                aria-label={label}
                title={label}
                data-testid={`${T}-d-view-${key}`}
                onClick={() => setView(key)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-colors",
                  view === key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
          <NewMenu drive={drive} />
        </div>
      </div>

      <FilesToolbar drive={drive}>{view === "grid" && <SortMenu drive={drive} />}</FilesToolbar>

      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1">
          {view === "list" ? (
            <ListTable drive={drive} activeId={active?.id ?? null} onActivate={setActiveId} />
          ) : (
            <Gallery drive={drive} activeId={active?.id ?? null} onSelect={setActiveId} />
          )}
        </div>
        <DetailPanel drive={drive} active={active} onClose={() => setActiveId(null)} />
      </div>
    </div>
  )
}
