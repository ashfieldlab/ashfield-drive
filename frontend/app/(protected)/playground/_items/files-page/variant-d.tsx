"use client"

import { useState } from "react"
import { LayoutGrid, List } from "lucide-react"

import { cn } from "@/lib/utils"
import { PreviewWindow } from "../file-preview/variant-c"
import { Breadcrumb, NewMenu, QuotaBar, SortMenu, T, useDrive } from "./shared"
import { FilesToolbar, ListTable } from "./variant-a"
import { Gallery } from "./variant-b"

type View = "list" | "grid"

const VIEWS: { key: View; label: string; icon: typeof List }[] = [
  { key: "list", label: "목록", icon: List },
  { key: "grid", label: "갤러리", icon: LayoutGrid },
]

// A + B: 목록/갤러리 전환. 파일을 누르면 미리보기(file-preview C), 폴더를 누르면 들어간다
export function VariantD() {
  const drive = useDrive()
  const [view, setView] = useState<View>("list")
  const [previewId, setPreviewId] = useState<string | null>(null)
  const files = drive.items.filter((n) => n.kind !== "folder")

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

      <FilesToolbar drive={drive}>
        <QuotaBar />
        {view === "grid" && <SortMenu drive={drive} />}
      </FilesToolbar>

      {view === "list" ? (
        <ListTable drive={drive} activeId={null} onActivate={setPreviewId} />
      ) : (
        <Gallery drive={drive} onSelect={setPreviewId} />
      )}

      {previewId && <PreviewWindow fixed files={files} initialId={previewId} onClose={() => setPreviewId(null)} />}
    </div>
  )
}
