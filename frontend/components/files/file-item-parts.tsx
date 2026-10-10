"use client"

/** 목록과 갤러리가 같이 쓰는 조각: 선택 상자, 이름 바꾸기 입력, 배지, 행 컨텍스트 */

import { useState } from "react"
import { Check, Lock, Users } from "lucide-react"

import { cn } from "@/lib/utils"
import type { NodeResponse } from "@/lib/types/api"
import type { UploadItem } from "@/lib/uploads/store"
import type { FileKind } from "@/components/files/file-meta"
import type { RowAction } from "@/components/files/file-row-menu"
import { FolderUploadBadge } from "@/components/files/upload-rows"

/** 목록과 갤러리에 넘기는 동작과 표시 규칙 */
export interface ItemCtx {
  displayName: (n: NodeResponse) => string
  kindOf: (n: NodeResponse) => FileKind
  isSelected: (id: string) => boolean
  anySelected: boolean
  toggle: (id: string) => void
  /** 행 누름: 폴더면 들어가고 파일이면 미리보기 */
  activate: (n: NodeResponse) => void
  actionsFor: (n: NodeResponse) => Set<RowAction>
  act: (a: RowAction, n: NodeResponse) => void
  renamingId: string | null
  /** null 이면 취소 */
  finishRename: (n: NodeResponse, value: string | null) => void
  isVaultFolder: (n: NodeResponse) => boolean
  isTeamFolder: (n: NodeResponse) => boolean
  isNew: (n: NodeResponse) => boolean
  /** 이 폴더 안으로 가는 업로드 */
  uploadsInto: (n: NodeResponse) => UploadItem[]
  folderHref: (n: NodeResponse) => string
}

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  testid,
  label,
  className,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
  testid: string
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate && !checked ? "mixed" : checked}
      aria-label={label}
      data-testid={testid}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        checked || indeterminate
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background hover:border-foreground/40",
        className,
      )}
    >
      {checked && <Check className="size-3" strokeWidth={3} />}
      {!checked && indeterminate && <span className="h-0.5 w-2 rounded-full bg-current" />}
    </button>
  )
}

export function RenameInput({
  initial,
  isFolder,
  onDone,
  className,
}: {
  initial: string
  isFolder: boolean
  onDone: (v: string | null) => void
  className?: string
}) {
  const [v, setV] = useState(initial)
  const [closed, setClosed] = useState(false)
  const done = (val: string | null) => {
    if (closed) return
    setClosed(true)
    onDone(val)
  }
  return (
    <input
      data-testid="files-rename-input"
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => {
        // 확장자 앞까지만 선택
        const dot = isFolder ? -1 : e.target.value.lastIndexOf(".")
        e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length)
      }}
      onBlur={() => done(v)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Enter") done(v)
        if (e.key === "Escape") done(null)
      }}
      className={cn(
        "h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    />
  )
}

/** 이름 옆 표시: 보안 폴더, 부서 폴더, 업로드 상태, 새 항목, 폴더로 가는 업로드 */
export function Badges({ node, ctx, className }: { node: NodeResponse; ctx: ItemCtx; className?: string }) {
  const pendingBadge =
    node.status === "pending" ? (
      Date.now() - new Date(node.updated_at).getTime() > PENDING_STALE_MS ? (
        <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
          업로드 실패
        </span>
      ) : (
        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
          업로드 중
        </span>
      )
    ) : null
  const into = node.kind === "folder" ? ctx.uploadsInto(node) : []
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-muted-foreground", className)}>
      {ctx.isVaultFolder(node) && (
        <Lock aria-label="보안 폴더" className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      )}
      {ctx.isTeamFolder(node) && <Users aria-label="부서 폴더" className="size-3.5 shrink-0" />}
      {pendingBadge}
      {ctx.isNew(node) && (
        <span
          className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
          data-testid={`files-row-${node.id}-new`}
        >
          새 항목
        </span>
      )}
      {into.length > 0 && <FolderUploadBadge items={into} />}
    </span>
  )
}

// pending 노드 판별: 진행 중 vs 방치. status 만으로는 구별 불가(둘 다 pending) 이라 시각 기반:
// 최근이면 업로드 중(데스크톱 multipart 등), 오래되면 끊긴 업로드.
const PENDING_STALE_MS = 30 * 60 * 1000

export function isStalePending(n: NodeResponse): boolean {
  return Date.now() - new Date(n.updated_at).getTime() > PENDING_STALE_MS
}
