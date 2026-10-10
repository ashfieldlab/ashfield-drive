"use client"

import { Fragment } from "react"

import {
  Download,
  FileText,
  FolderInput,
  FolderOpen,
  History,
  MoreHorizontal,
  Pencil,
  Share2,
  Trash2,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { NodeResponse } from "@/lib/types/api"

export type RowAction = "open" | "download" | "share" | "rename" | "move" | "versions" | "delete"

/** 이 노드에 보여줄 동작. 권한과 보안 폴더 규칙을 한곳에서 */
export function rowActions(node: NodeResponse, opts: { canWrite: boolean; inVault: boolean }): Set<RowAction> {
  const pending = node.status === "pending"
  const s = new Set<RowAction>()
  if (!pending) {
    s.add("open")
    s.add("download")
  }
  if (opts.canWrite) {
    // 보안 폴더 안: 개별 공유 없음(폴더 단위로만), 이동 없음(밖으로 나가면 암호 경계가 깨짐).
    if (!opts.inVault) s.add("share")
    s.add("rename")
    if (!opts.inVault) s.add("move")
    if (node.kind === "file" && !pending) s.add("versions")
    s.add("delete")
  }
  return s
}

const ITEMS: { a: RowAction; icon: LucideIcon; label: string }[] = [
  { a: "open", icon: FileText, label: "열기" },
  { a: "download", icon: Download, label: "다운로드" },
  { a: "share", icon: Share2, label: "공유" },
  { a: "rename", icon: Pencil, label: "이름 변경" },
  { a: "move", icon: FolderInput, label: "이동" },
  { a: "versions", icon: History, label: "버전 기록" },
]

export function FileRowMenu({
  node,
  actions,
  onAction,
  className,
}: {
  node: NodeResponse
  actions: Set<RowAction>
  onAction: (a: RowAction, n: NodeResponse) => void
  className?: string
}) {
  if (actions.size === 0) return null
  const visible = ITEMS.filter((i) => actions.has(i.a))
  // 열기와 다운로드 / 나머지 편집 동작 사이 구분선
  const sepAt = visible.findIndex((i) => i.a !== "open" && i.a !== "download")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-testid={`files-row-${node.id}-menu`}
          variant="ghost"
          size="icon-sm"
          aria-label="더 보기"
          onClick={(e) => e.stopPropagation()}
          className={cn("text-muted-foreground", className)}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
        {visible.map(({ a, icon: Icon, label }, i) => {
          const ItemIcon = a === "open" && node.kind === "folder" ? FolderOpen : Icon
          return (
            <Fragment key={a}>
              {i === sepAt && i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem data-testid={`files-menu-${a}`} onSelect={() => onAction(a, node)}>
                <ItemIcon />
                {label}
              </DropdownMenuItem>
            </Fragment>
          )
        })}
        {actions.has("delete") && (
          <>
            {visible.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem data-testid="files-menu-delete" variant="destructive" onSelect={() => onAction("delete", node)}>
              <Trash2 />
              삭제
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
