"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Download, History, Info, MoreHorizontal, Share2, Trash2, X } from "lucide-react"

import { cn } from "@/lib/utils"

import { NODES, formatBytes, memberOf, relativeTime } from "../_mock"
import { InfoPanel, SharePanel, VersionsPanel } from "./panels"
import { Avatar, FILES, KindIcon, PreviewBody, Thumb, usePreviewNav } from "./shared"

type Tab = "info" | "versions" | "share"

const SLUG = "file-preview"
const FOLDERS = NODES.filter((n) => n.kind === "folder" && !n.parentId)

/** B: 목록은 그대로, 오른쪽에서 밀려 나오는 시트 */
export function VariantB() {
  const [open, setOpen] = useState(true)
  const [deleted, setDeleted] = useState<string[]>([])
  const files = FILES.filter((f) => !deleted.includes(f.id))
  const { index, setIndex, prev, next } = usePreviewNav(files.length, () => setOpen(false), 5)
  const [tab, setTab] = useState<Tab>("info")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const node = files[Math.min(index, files.length - 1)]

  return (
    <div className="relative flex h-[calc(100dvh-3.5rem-3rem-3rem)] min-h-[560px] overflow-hidden rounded-xl border bg-background">
      {/* 파일 목록 */}
      <div className="min-w-0 flex-1 overflow-auto">
        <div className="sticky top-0 z-10 flex h-12 items-center border-b bg-background/90 px-4 backdrop-blur">
          <p className="text-sm font-semibold text-foreground">내 파일</p>
          <span className="ml-2 text-xs text-muted-foreground tabular-nums">{FOLDERS.length + files.length}</span>
        </div>
        <ul data-testid="pg-file-preview-b-list" className="p-2">
          {FOLDERS.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground">
              <KindIcon kind="folder" />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="w-16 text-right text-xs tabular-nums">{f.count}개</span>
            </li>
          ))}
          {files.map((f, i) => {
            const active = open && i === index
            return (
              <li key={f.id}>
                <button
                  type="button"
                  data-testid={`pg-file-preview-b-row-${f.id}`}
                  onClick={() => {
                    setIndex(i)
                    setOpen(true)
                    setConfirmDelete(false)
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    active ? "bg-primary/10 text-foreground ring-1 ring-primary/30" : "text-foreground hover:bg-muted/60",
                  )}
                >
                  <Thumb node={f} className="size-7 shrink-0 [&_svg]:size-3.5" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className={cn("w-20 text-xs text-muted-foreground", open ? "hidden 2xl:block" : "hidden lg:block")}>
                    {memberOf(f.owner).name}
                  </span>
                  <span className="w-16 text-right text-xs text-muted-foreground">{relativeTime(f.updatedAt)}</span>
                  <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">{formatBytes(f.size)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* 시트 */}
      {open && node && (
        <aside
          key="sheet"
          className="flex w-[520px] shrink-0 flex-col border-l bg-card shadow-[-12px_0_32px_-16px_rgb(0_0_0/0.25)] animate-in slide-in-from-right-8 fade-in duration-200"
        >
          <header className="flex h-12 shrink-0 items-center gap-2 border-b pl-4 pr-2">
            <KindIcon kind={node.kind} />
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{node.name}</p>
            <button
              type="button"
              data-testid="pg-file-preview-b-prev"
              onClick={prev}
              title="이전"
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronUp className="size-4" />
            </button>
            <button
              type="button"
              data-testid="pg-file-preview-b-next"
              onClick={next}
              title="다음"
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronDown className="size-4" />
            </button>
            <span className="h-4 w-px bg-border" />
            <button
              type="button"
              data-testid="pg-file-preview-b-close"
              onClick={() => setOpen(false)}
              title="닫기"
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </header>

          <div className="relative h-[46%] shrink-0 overflow-auto bg-muted/40 p-6">
            <div className="flex min-h-full items-center justify-center">
              <PreviewBody key={node.id} node={node} compact />
            </div>
          </div>

          {/* 액션 */}
          <div className="flex shrink-0 items-center gap-1.5 border-y px-4 py-2.5">
            <button
              type="button"
              data-testid="pg-file-preview-b-download"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Download className="size-3.5" />
              다운로드
            </button>
            <button
              type="button"
              data-testid="pg-file-preview-b-share"
              onClick={() => setTab("share")}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            >
              <Share2 className="size-3.5" />
              공유
            </button>
            <div className="ml-auto flex items-center -space-x-1.5">
              <Avatar id={node.owner} />
              {node.sharedWith > 0 && (
                <span className="inline-grid size-6 place-items-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-card">
                  +{node.sharedWith}
                </span>
              )}
            </div>
            {confirmDelete ? (
              <button
                type="button"
                data-testid="pg-file-preview-b-delete-confirm"
                onClick={() => {
                  setDeleted((d) => [...d, node.id])
                  setConfirmDelete(false)
                }}
                onBlur={() => setConfirmDelete(false)}
                autoFocus
                className="ml-2 rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-[#fff] hover:bg-rose-500"
              >
                삭제 확인
              </button>
            ) : (
              <button
                type="button"
                data-testid="pg-file-preview-b-delete"
                onClick={() => setConfirmDelete(true)}
                title="삭제"
                className="ml-2 rounded-md p-2 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
              >
                <Trash2 className="size-4" />
              </button>
            )}
            <button
              type="button"
              data-testid="pg-file-preview-b-more"
              title="더보기"
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </div>

          {/* 탭 */}
          <div className="flex shrink-0 gap-4 border-b px-4">
            {(
              [
                ["info", "정보", Info],
                ["versions", "버전 기록", History],
                ["share", "공유", Share2],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                data-testid={`pg-file-preview-b-tab-${key}`}
                onClick={() => setTab(key)}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 border-b-2 py-2.5 text-sm transition-colors",
                  tab === key
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
            {tab === "info" && <InfoPanel node={node} />}
            {tab === "versions" && <VersionsPanel key={node.id} node={node} slug={SLUG} />}
            {tab === "share" && <SharePanel key={node.id} node={node} slug={SLUG} />}
          </div>
        </aside>
      )}
    </div>
  )
}
