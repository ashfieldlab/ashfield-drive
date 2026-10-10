"use client"

/** 갤러리 보기 (playground files-page B): 폴더 타일 + 파일 카드 */

import { Play } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatBytes } from "@/lib/utils/format"
import type { NodeResponse } from "@/lib/types/api"
import { KIND, KindIcon, plainSize, relativeTime, type FileKind } from "@/components/files/file-meta"
import { Badges, Checkbox, RenameInput, type ItemCtx } from "@/components/files/file-item-parts"
import { FileRowMenu } from "@/components/files/file-row-menu"

export function FilesGallery({ items, ctx }: { items: NodeResponse[]; ctx: ItemCtx }) {
  const folders = items.filter((n) => n.kind === "folder")
  const files = items.filter((n) => n.kind !== "folder")
  return (
    <div data-testid="files-gallery">
      {folders.length > 0 && (
        <>
          <h3 className="mb-2.5 text-xs font-medium text-muted-foreground">폴더</h3>
          <div className="mb-7 grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
            {folders.map((n) => (
              <FolderTile key={n.id} node={n} ctx={ctx} />
            ))}
          </div>
        </>
      )}
      {files.length > 0 && (
        <>
          <h3 className="mb-2.5 text-xs font-medium text-muted-foreground">파일</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(184px,1fr))] gap-3">
            {files.map((n) => (
              <FileCard key={n.id} node={n} ctx={ctx} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Name({ node, ctx }: { node: NodeResponse; ctx: ItemCtx }) {
  if (ctx.renamingId === node.id) {
    return (
      <RenameInput initial={ctx.displayName(node)} isFolder={node.kind === "folder"} onDone={(v) => ctx.finishRename(node, v)} />
    )
  }
  return (
    <span className="min-w-0 flex-1 truncate text-sm font-medium" title={ctx.displayName(node)} data-testid={`files-row-${node.id}-name`}>
      {ctx.displayName(node)}
    </span>
  )
}

function FolderTile({ node, ctx }: { node: NodeResponse; ctx: ItemCtx }) {
  const checked = ctx.isSelected(node.id)
  const vault = ctx.isVaultFolder(node)
  const meta = KIND.folder
  return (
    <div
      data-testid={`files-row-${node.id}`}
      onClick={() => (ctx.anySelected ? ctx.toggle(node.id) : ctx.activate(node))}
      className={cn(
        "group relative flex h-16 cursor-pointer items-center gap-3 rounded-xl border bg-card pr-1.5 pl-3 transition-colors",
        checked ? "border-primary/60 bg-primary/[0.06] ring-1 ring-primary/40" : "hover:bg-muted/50",
      )}
    >
      <span
        className={cn(
          "relative flex size-9 shrink-0 items-center justify-center rounded-lg",
          vault ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400" : [meta.bg, meta.fg],
        )}
      >
        <KindIcon
          kind="folder"
          vault={vault}
          className={cn("size-[18px] transition-opacity group-hover:opacity-0", (checked || ctx.anySelected) && "opacity-0")}
        />
        <Checkbox
          testid={`files-row-${node.id}-select`}
          label="선택"
          checked={checked}
          onChange={() => ctx.toggle(node.id)}
          className={cn("absolute", !checked && !ctx.anySelected && "opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100")}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Name node={node} ctx={ctx} />
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="shrink-0">{relativeTime(node.updated_at)}</span>
          <Badges node={node} ctx={ctx} />
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 has-[[data-state=open]]:opacity-100 pointer-coarse:opacity-100">
        <FileRowMenu node={node} actions={ctx.actionsFor(node)} onAction={ctx.act} />
      </div>
    </div>
  )
}

/** 썸네일 대신 종류별 대략적인 모양 */
function Placeholder({ kind }: { kind: FileKind }) {
  const meta = KIND[kind]
  if (kind === "video") {
    return (
      <span className="flex size-12 items-center justify-center rounded-full bg-background/90 shadow-sm">
        <Play className={cn("ml-0.5 size-5 fill-current", meta.fg)} />
      </span>
    )
  }
  if (kind === "audio") {
    return (
      <span className={cn("flex h-12 items-center gap-[3px]", meta.fg)}>
        {[6, 14, 22, 30, 18, 38, 26, 12, 34, 20, 28, 10, 24, 16, 8].map((h, i) => (
          <span key={i} className="w-[3px] rounded-full bg-current opacity-70" style={{ height: h }} />
        ))}
      </span>
    )
  }
  if (["doc", "pdf", "sheet", "text", "code", "slide"].includes(kind)) {
    const wide = kind === "slide"
    return (
      <span
        className={cn(
          "flex flex-col gap-1.5 rounded-[3px] bg-background p-2.5 shadow-sm ring-1 ring-foreground/5",
          wide ? "aspect-video w-[68%] translate-y-3" : "aspect-[3/4] w-[46%] translate-y-5",
        )}
      >
        <span className={cn("h-1.5 w-1/2 rounded-full bg-current", meta.fg)} />
        {kind === "sheet" ? (
          <span className="mt-1 grid grid-cols-3 gap-px overflow-hidden rounded-[2px] bg-border">
            {Array.from({ length: 15 }).map((_, i) => (
              <span key={i} className="h-2 bg-background" />
            ))}
          </span>
        ) : (
          [90, 75, 85, 60, 80].slice(0, wide ? 3 : 5).map((w, i) => (
            <span key={i} className="h-1 rounded-full bg-muted" style={{ width: `${w}%` }} />
          ))
        )}
      </span>
    )
  }
  return <KindIcon kind={kind} className={cn("size-12", meta.fg)} strokeWidth={1.25} />
}

function FileCard({ node, ctx }: { node: NodeResponse; ctx: ItemCtx }) {
  const checked = ctx.isSelected(node.id)
  const kind = ctx.kindOf(node)
  const meta = KIND[kind]
  return (
    <div
      data-testid={`files-row-${node.id}`}
      onClick={() => (ctx.anySelected ? ctx.toggle(node.id) : ctx.activate(node))}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-xl border bg-card transition-shadow",
        checked ? "border-primary/60 ring-2 ring-primary/40" : "hover:shadow-md",
      )}
    >
      <div className={cn("relative flex aspect-[4/3] items-center justify-center overflow-hidden", meta.bg)}>
        <Placeholder kind={kind} />
        <span
          className={cn(
            "absolute top-2 left-2 rounded-md bg-background/85 p-1 shadow-sm backdrop-blur",
            !checked && !ctx.anySelected && "opacity-0 group-hover:opacity-100",
          )}
        >
          <Checkbox testid={`files-row-${node.id}-select`} label="선택" checked={checked} onChange={() => ctx.toggle(node.id)} />
        </span>
        <div className="absolute top-1.5 right-1.5 rounded-lg bg-background/85 opacity-0 shadow-sm backdrop-blur group-hover:opacity-100 has-[[data-state=open]]:opacity-100 pointer-coarse:opacity-100">
          <FileRowMenu node={node} actions={ctx.actionsFor(node)} onAction={ctx.act} />
        </div>
      </div>
      <div className="flex items-center gap-2 border-t px-3 pt-2.5 pb-2">
        <KindIcon kind={kind} className={cn("size-4 shrink-0", meta.fg)} />
        <Name node={node} ctx={ctx} />
      </div>
      <div className="flex min-w-0 items-center gap-1.5 px-3 pb-3 text-xs text-muted-foreground">
        <span className="shrink-0 tabular-nums">{formatBytes(plainSize(node))}</span>
        <Badges node={node} ctx={ctx} className="min-w-0" />
        <span className="ml-auto shrink-0 tabular-nums">{relativeTime(node.updated_at)}</span>
      </div>
    </div>
  )
}
