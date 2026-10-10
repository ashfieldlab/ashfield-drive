"use client"

import { useState } from "react"
import { LayoutGrid, List, Play } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatBytes, memberOf, relativeTime, type MockNode } from "../_mock"
import {
  Avatar,
  AvatarStack,
  Badges,
  Breadcrumb,
  BulkBar,
  Checkbox,
  EmptyFolder,
  FileGlyph,
  FilterTabs,
  KIND,
  NewMenu,
  QuotaBar,
  RenameInput,
  RowMenu,
  SortMenu,
  T,
  KindIcon,
  sharedMembers,
  useDrive,
  type Drive,
} from "./shared"

// 갤러리: 폴더 타일 + 파일 카드
export function VariantB() {
  const drive = useDrive()
  const [view, setView] = useState<"grid" | "list">("grid")

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <Breadcrumb drive={drive} big className="-ml-1.5" />
        <div className="flex items-center gap-1.5">
          <SortMenu drive={drive} />
          <div className="flex items-center rounded-lg border p-0.5">
            {(["grid", "list"] as const).map((v) => {
              const Icon = v === "grid" ? LayoutGrid : List
              return (
                <button
                  key={v}
                  type="button"
                  data-testid={`${T}-view-${v}`}
                  aria-label={v === "grid" ? "격자" : "목록"}
                  onClick={() => setView(v)}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md transition-colors",
                    view === v ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </button>
              )
            })}
          </div>
          <NewMenu drive={drive} className="ml-1.5" />
        </div>
      </div>

      <div className="sticky -top-6 z-10 -mx-2 mb-5 flex h-10 items-center justify-between gap-3 bg-background/90 px-2 backdrop-blur">
        {drive.selected.length > 0 ? (
          <BulkBar drive={drive} />
        ) : (
          <>
            <FilterTabs drive={drive} />
            <QuotaBar />
          </>
        )}
      </div>

      <Gallery drive={drive} view={view} />
    </div>
  )
}

/** 폴더 타일 + 파일 카드. onSelect 를 주면 파일 카드를 누를 때 기본 열기 대신 그걸 부른다 */
export function Gallery({
  drive,
  view = "grid",
  activeId,
  onSelect,
}: {
  drive: Drive
  view?: "grid" | "list"
  activeId?: string | null
  onSelect?: (id: string) => void
}) {
  const folders = drive.items.filter((n) => n.kind === "folder")
  const files = drive.items.filter((n) => n.kind !== "folder")
  return (
    <>
      {drive.items.length === 0 && <EmptyFolder node={drive.folderNode} className="rounded-xl border border-dashed" />}

      {view === "grid" ? (
        <>
          {folders.length > 0 && (
            <>
              <h3 className="mb-2.5 text-xs font-medium text-muted-foreground">폴더</h3>
              <div className="mb-7 grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
                {folders.map((n) => (
                  <FolderTile key={n.id} node={n} drive={drive} />
                ))}
              </div>
            </>
          )}
          {files.length > 0 && (
            <>
              <h3 className="mb-2.5 text-xs font-medium text-muted-foreground">파일</h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(184px,1fr))] gap-3">
                {files.map((n) => (
                  <FileCard key={n.id} node={n} drive={drive} active={activeId === n.id} onSelect={onSelect} />
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {drive.items.map((n) => (
            <ListRow key={n.id} node={n} drive={drive} />
          ))}
        </div>
      )}
    </>
  )
}

function Name({ node, drive, className }: { node: MockNode; drive: Drive; className?: string }) {
  if (drive.renamingId === node.id) return <RenameInput node={node} onDone={(v) => drive.rename(node.id, v)} />
  return <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", className)}>{node.name}</span>
}

function FolderTile({ node, drive }: { node: MockNode; drive: Drive }) {
  const checked = drive.selected.includes(node.id)
  const meta = KIND.folder
  return (
    <div
      data-testid={`${T}-row-${node.id}`}
      onClick={() => drive.open(node.id)}
      className={cn(
        "group relative flex h-16 cursor-pointer items-center gap-3 rounded-xl border bg-card pr-1.5 pl-3 transition-colors",
        checked ? "border-primary/60 bg-primary/[0.06] ring-1 ring-primary/40" : "hover:bg-muted/50",
      )}
    >
      <span className={cn("relative flex size-9 shrink-0 items-center justify-center rounded-lg", meta.bg, meta.fg, node.vault && "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400")}>
        <KindIcon node={node} className={cn("size-[18px] transition-opacity", (checked || drive.selected.length > 0) && "opacity-0", "group-hover:opacity-0")} />
        <Checkbox
          testid={`${T}-check-${node.id}`}
          checked={checked}
          onChange={() => drive.toggle(node.id)}
          className={cn("absolute", !checked && drive.selected.length === 0 && "opacity-0 group-hover:opacity-100")}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Name node={node} drive={drive} />
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="tabular-nums">{node.count ?? 0}개</span>
          <Badges node={node} />
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
        <RowMenu node={node} onAction={drive.act} />
      </div>
    </div>
  )
}

/** 썸네일 없는 파일의 대략적인 모양 */
function Placeholder({ node }: { node: MockNode }) {
  const meta = KIND[node.kind]
  if (node.kind === "video") {
    return (
      <span className="flex size-12 items-center justify-center rounded-full bg-background/90 shadow-sm">
        <Play className={cn("ml-0.5 size-5 fill-current", meta.fg)} />
      </span>
    )
  }
  if (node.kind === "audio") {
    return (
      <span className={cn("flex h-12 items-center gap-[3px]", meta.fg)}>
        {[6, 14, 22, 30, 18, 38, 26, 12, 34, 20, 28, 10, 24, 16, 8].map((h, i) => (
          <span key={i} className="w-[3px] rounded-full bg-current opacity-70" style={{ height: h }} />
        ))}
      </span>
    )
  }
  if (["doc", "pdf", "sheet", "text", "code", "slide"].includes(node.kind)) {
    const wide = node.kind === "slide"
    return (
      <span
        className={cn(
          "flex flex-col gap-1.5 rounded-[3px] bg-background p-2.5 shadow-sm ring-1 ring-foreground/5",
          wide ? "aspect-video w-[68%] translate-y-3" : "aspect-[3/4] w-[46%] translate-y-5",
        )}
      >
        <span className={cn("h-1.5 w-1/2 rounded-full bg-current", meta.fg)} />
        {node.kind === "sheet" ? (
          <span className="mt-1 grid grid-cols-3 gap-px overflow-hidden rounded-[2px] bg-border">
            {Array.from({ length: 15 }).map((_, i) => (
              <span key={i} className="h-2 bg-background" />
            ))}
          </span>
        ) : (
          [90, 75, 85, 60, 80].slice(0, wide ? 3 : 5).map((w, i) => <span key={i} className="h-1 rounded-full bg-muted" style={{ width: `${w}%` }} />)
        )}
      </span>
    )
  }
  return <KindIcon node={node} className={cn("size-12", meta.fg)} strokeWidth={1.25} />
}

function FileCard({ node, drive, active, onSelect }: { node: MockNode; drive: Drive; active?: boolean; onSelect?: (id: string) => void }) {
  const checked = drive.selected.includes(node.id)
  const meta = KIND[node.kind]
  const owner = memberOf(node.owner)
  return (
    <div
      data-testid={`${T}-row-${node.id}`}
      onClick={() => (drive.selected.length > 0 ? drive.toggle(node.id) : onSelect ? onSelect(node.id) : drive.act("open", node))}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-xl border bg-card transition-shadow",
        checked ? "border-primary/60 ring-2 ring-primary/40" : active ? "border-primary/50 ring-1 ring-primary/30" : "hover:shadow-md",
      )}
    >
      <div
        className={cn("relative flex aspect-[4/3] items-center justify-center overflow-hidden", !node.thumb && meta.bg)}
        style={node.thumb ? { background: node.thumb } : undefined}
      >
        {!node.thumb && <Placeholder node={node} />}
        <span
          className={cn(
            "absolute top-2 left-2 rounded-md bg-background/85 p-1 shadow-sm backdrop-blur",
            !checked && drive.selected.length === 0 && "opacity-0 group-hover:opacity-100",
          )}
        >
          <Checkbox testid={`${T}-check-${node.id}`} checked={checked} onChange={() => drive.toggle(node.id)} />
        </span>
        <div className="absolute top-1.5 right-1.5 rounded-lg bg-background/85 opacity-0 shadow-sm backdrop-blur group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
          <RowMenu node={node} onAction={drive.act} />
        </div>
        {node.sharedWith > 0 && (
          <AvatarStack members={sharedMembers(node)} max={3} className="absolute bottom-2 left-2" ring="ring-background/80" />
        )}
      </div>
      <div className="flex items-center gap-2 border-t px-3 pt-2.5 pb-2">
        <FileGlyph node={{ ...node, thumb: undefined }} plain iconClassName="size-4" />
        <Name node={node} drive={drive} />
        <Badges node={{ ...node, sharedWith: 0 }} className="shrink-0" />
      </div>
      <div className="flex items-center gap-1.5 px-3 pb-3 text-xs text-muted-foreground">
        <Avatar member={owner} className="size-4 text-[8px]" />
        <span className="truncate">{owner.id === "u1" ? "나" : owner.name}</span>
        <span className="ml-auto shrink-0 tabular-nums">{relativeTime(node.updatedAt)}</span>
      </div>
    </div>
  )
}

function ListRow({ node, drive }: { node: MockNode; drive: Drive }) {
  const checked = drive.selected.includes(node.id)
  return (
    <div
      data-testid={`${T}-row-${node.id}`}
      onClick={() => drive.act("open", node)}
      className={cn("group flex h-11 cursor-pointer items-center gap-3 px-3 first:rounded-t-xl last:rounded-b-xl", checked ? "bg-primary/[0.06]" : "hover:bg-muted/50")}
    >
      <Checkbox testid={`${T}-check-${node.id}`} checked={checked} onChange={() => drive.toggle(node.id)} />
      <FileGlyph node={node} className="size-7" />
      <Name node={node} drive={drive} />
      <Badges node={node} className="shrink-0" />
      <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
        {node.kind === "folder" ? `${node.count ?? 0}개` : formatBytes(node.size)}
      </span>
      <span className="w-20 text-right text-xs text-muted-foreground">{relativeTime(node.updatedAt)}</span>
      <div className="opacity-0 group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
        <RowMenu node={node} onAction={drive.act} />
      </div>
    </div>
  )
}
