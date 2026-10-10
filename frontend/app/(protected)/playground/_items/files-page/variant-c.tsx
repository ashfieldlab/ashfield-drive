"use client"

import { useState } from "react"
import { ChevronRight, Download, Eye, MoreHorizontal, Share2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { QUOTA, formatBytes, memberOf, relativeTime, type MockNode } from "../_mock"
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

// 컬럼 브라우저 (Finder 식)
export function VariantC() {
  const drive = useDrive()
  const [focusId, setFocusId] = useState<string | null>("n-plan")
  const [menuFor, setMenuFor] = useState<string | null>(null)

  const focus = drive.nodes.find((n) => n.id === focusId && n.parentId === drive.folderId) ?? null
  // 루트 + 열린 폴더마다 한 칸
  const columns: { parent: MockNode | null }[] = [{ parent: null }, ...drive.path.map((p) => ({ parent: p }))]
  const inPath = new Set(drive.path.map((p) => p.id))
  const total = drive.items.length

  function clickRow(n: MockNode, e: React.MouseEvent) {
    if (e.metaKey || e.ctrlKey) {
      drive.toggle(n.id)
      return
    }
    if (n.kind === "folder") {
      drive.open(n.id)
      setFocusId(null)
    } else {
      if (n.parentId !== drive.folderId) drive.open(n.parentId)
      setFocusId(n.id)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <Breadcrumb drive={drive} big className="-ml-1.5" />
        <NewMenu drive={drive} />
      </div>

      <div className="flex h-9 items-center justify-between gap-3">
        {drive.selected.length > 0 ? (
          <BulkBar drive={drive} />
        ) : (
          <>
            <FilterTabs drive={drive} look="segment" />
            <SortMenu drive={drive} />
          </>
        )}
      </div>

      <div className="flex h-[calc(100dvh-15rem)] min-h-[460px] flex-col overflow-hidden rounded-xl border bg-card">
        <div className="flex min-h-0 flex-1 overflow-x-auto">
          {columns.map(({ parent }, ci) => {
            const list = drive.childrenOf(parent?.id ?? null)
            const isLast = ci === columns.length - 1
            return (
              <div key={parent?.id ?? "root"} className="flex w-64 shrink-0 flex-col border-r">
                <div className="flex h-9 shrink-0 items-center justify-between border-b px-3 text-xs text-muted-foreground">
                  <span className="truncate font-medium">{parent ? parent.name : "내 파일"}</span>
                  <span className="tabular-nums">{list.length}</span>
                </div>
                <div className="min-h-0 flex-1 space-y-px overflow-y-auto p-1.5">
                  {list.length === 0 && <EmptyFolder node={parent} className="py-10" />}
                  {list.map((n) => {
                    const open = inPath.has(n.id) || focus?.id === n.id
                    const deepest = open && isLast
                    const checked = drive.selected.includes(n.id)
                    return (
                      <div
                        key={n.id}
                        data-testid={`${T}-row-${n.id}`}
                        onClick={(e) => clickRow(n, e)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setMenuFor(n.id)
                        }}
                        className={cn(
                          "group flex h-8 cursor-default items-center gap-2 rounded-md pr-1 pl-2 text-sm",
                          deepest
                            ? "bg-primary text-primary-foreground"
                            : open
                              ? "bg-muted"
                              : checked
                                ? "bg-primary/10"
                                : "hover:bg-muted/60",
                        )}
                      >
                        <span className="relative flex size-4 shrink-0 items-center justify-center">
                          <FileGlyph
                            node={n}
                            plain
                            className="size-4"
                            iconClassName={cn("size-4", deepest && "text-primary-foreground dark:text-primary-foreground")}
                          />
                          <Checkbox
                            testid={`${T}-check-${n.id}`}
                            checked={checked}
                            onChange={() => drive.toggle(n.id)}
                            className={cn("absolute inset-0", !checked && "opacity-0 group-hover:opacity-100")}
                          />
                        </span>
                        {drive.renamingId === n.id ? (
                          <RenameInput node={n} onDone={(v) => drive.rename(n.id, v)} className="h-6 text-foreground" />
                        ) : (
                          <span className="min-w-0 flex-1 truncate">{n.name}</span>
                        )}
                        <Badges node={{ ...n, sharedWith: 0 }} className={cn("shrink-0", deepest && "text-primary-foreground/80")} />
                        <span
                          className={cn(
                            "hidden group-hover:block has-[[data-state=open]]:block",
                            menuFor === n.id && "block",
                          )}
                        >
                          <RowMenu
                            node={n}
                            onAction={drive.act}
                            open={menuFor === n.id ? true : undefined}
                            onOpenChange={(o) => setMenuFor(o ? n.id : null)}
                            trigger={
                              <Button
                                data-testid={`${T}-row-menu-${n.id}`}
                                variant="ghost"
                                size="icon-xs"
                                aria-label="더 보기"
                                onClick={(e) => e.stopPropagation()}
                                className={cn(deepest && "text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground")}
                              >
                                <MoreHorizontal />
                              </Button>
                            }
                          />
                        </span>
                        {n.kind === "folder" && (
                          <ChevronRight className={cn("size-3.5 shrink-0", deepest ? "text-primary-foreground/80" : "text-muted-foreground/60")} />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <div className="min-w-80 flex-1">{focus ? <Preview node={focus} drive={drive} /> : null}</div>
        </div>

        <div className="flex h-9 shrink-0 items-center justify-between border-t bg-muted/30 px-3 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {drive.selected.length > 0 ? `${drive.selected.length}개 선택, ` : ""}
            {total}개 항목
          </span>
          <div className="flex items-center gap-3">
            <QuotaBar />
            <span className="tabular-nums">{formatBytes(QUOTA.total - QUOTA.used)} 남음</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Preview({ node, drive }: { node: MockNode; drive: Drive }) {
  const meta = KIND[node.kind]
  const owner = memberOf(node.owner)
  const people = sharedMembers(node)
  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-8 py-8">
      <div
        className={cn("flex aspect-square w-full max-w-56 items-center justify-center rounded-2xl shadow-sm ring-1 ring-foreground/5", !node.thumb && meta.bg)}
        style={node.thumb ? { background: node.thumb } : undefined}
      >
        {!node.thumb && <KindIcon node={node} className={cn("size-20", meta.fg)} strokeWidth={1} />}
      </div>
      <h2 className="mt-5 max-w-full text-center text-base font-semibold break-all">{node.name}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {meta.label}, {formatBytes(node.size)}
      </p>
      <div className="mt-4 flex gap-2">
        <Button data-testid={`${T}-preview-open`} size="sm" variant="outline" onClick={() => drive.act("open", node)}>
          <Eye />
          열기
        </Button>
        <Button data-testid={`${T}-preview-download`} size="sm" variant="outline" onClick={() => drive.act("download", node)}>
          <Download />
          다운로드
        </Button>
        <Button data-testid={`${T}-preview-share`} size="sm" onClick={() => drive.act("share", node)}>
          <Share2 />
          공유
        </Button>
      </div>

      <dl className="mt-7 grid w-full max-w-72 grid-cols-[5rem_minmax(0,1fr)] gap-y-2.5 border-t pt-5 text-sm">
        <dt className="text-muted-foreground">수정</dt>
        <dd className="text-right">{relativeTime(node.updatedAt)}</dd>
        <dt className="text-muted-foreground">소유자</dt>
        <dd className="flex items-center justify-end gap-1.5">
          <Avatar member={owner} className="size-5 text-[9px]" />
          {owner.id === "u1" ? "나" : owner.name}
        </dd>
        <dt className="text-muted-foreground">공유</dt>
        <dd className="flex items-center justify-end gap-2">
          {people.length > 0 ? <AvatarStack members={people} ring="ring-card" /> : <span className="text-muted-foreground">없음</span>}
        </dd>
        <dt className="text-muted-foreground">상태</dt>
        <dd className="flex justify-end">
          {node.starred || node.hasLink || node.vault || node.sharedWith > 0 ? <Badges node={node} /> : <span className="text-muted-foreground">없음</span>}
        </dd>
      </dl>
    </div>
  )
}
