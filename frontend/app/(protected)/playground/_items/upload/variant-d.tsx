"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowDownToLine, ChevronDown, ChevronRight, CircleAlert, CircleCheck, FolderUp, Images, MousePointerClick, Upload, X } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import { NODES, formatBytes, memberOf, relativeTime } from "../_mock"
import { KindIcon, Ring, formatEta, summarize, useDragState, useUploads, type Upload as Up } from "./shared"
import { GRID, UploadRow } from "./variant-b"

const ROOT_NAME = "내 파일"
const ROOT = NODES.filter((n) => !n.parentId)
/** 진행 행을 이 개수까지만 펼쳐 보이고 나머지는 한 줄로 묶는다 */
const SHOW = 3

/** D: B + 사이드바 업로드 표시 + 많이 올릴 때 묶기 */
export function VariantD() {
  const up = useUploads()
  const [folder, setFolder] = useState(ROOT_NAME)
  const drag = useDragState(() => up.addFiles())
  const [openFolders, setOpenFolders] = useState<string[]>([])
  const [expanded, setExpanded] = useState(false)

  const here = up.items.filter((u) => u.dest === folder)
  const pending = here.filter((u) => u.state !== "done" && u.state !== "canceled")
  // 실패는 묶지 않고 항상 위에
  const failed = pending.filter((u) => u.state === "failed")
  // 올라가는 중인 것이 대기 중인 것보다 먼저 보이게
  const rest = pending.filter((u) => u.state === "uploading").concat(pending.filter((u) => u.state === "queued"))
  const shown = expanded ? rest : rest.slice(0, SHOW)
  const hidden = rest.length - shown.length
  const finished = here.filter((u) => u.state === "done")
  const nodes = folder === ROOT_NAME ? ROOT : []

  function go(name: string) {
    setFolder(name)
    setExpanded(false)
  }

  return (
    <div
      {...drag.handlers}
      className="relative flex h-[calc(100dvh-3.5rem-3rem-3rem)] min-h-[560px] flex-col overflow-hidden rounded-xl border bg-background"
    >
      <SidebarIndicator items={up.items} current={folder} onGo={go} onRetryAll={up.retryAll} onClear={up.clearFinished} />

      <div className="flex h-14 shrink-0 items-center gap-3 px-5">
        <nav className="flex items-center gap-1 text-base font-semibold">
          <button
            type="button"
            data-testid="pg-upload-d-crumb-root"
            onClick={() => go(ROOT_NAME)}
            className={cn(folder !== ROOT_NAME && "text-muted-foreground hover:text-foreground")}
          >
            {ROOT_NAME}
          </button>
          {folder !== ROOT_NAME && (
            <>
              <ChevronRight className="size-4 text-muted-foreground" />
              <span>{folder}</span>
            </>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            data-testid="pg-upload-d-drag-toggle"
            onClick={drag.toggle}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
              drag.forced && "bg-muted text-foreground",
            )}
          >
            <MousePointerClick className="size-3.5" />
            드래그 상태
          </button>
          <button
            type="button"
            data-testid="pg-upload-d-many"
            onClick={() => up.addMany(50, folder)}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Images className="size-3.5" />
            사진 50장
          </button>
          <button
            type="button"
            data-testid="pg-upload-d-folder"
            onClick={up.addFolder}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            <FolderUp className="size-3.5" />
            폴더 업로드
          </button>
          <button
            type="button"
            data-testid="pg-upload-d-files"
            onClick={up.addFiles}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Upload className="size-3.5" />
            업로드
          </button>
        </div>
      </div>

      <div className={cn(GRID, "shrink-0 border-y bg-muted/40 px-5 py-2 text-xs font-medium text-muted-foreground")}>
        <span>이름</span>
        <span>소유자</span>
        <span>수정</span>
        <span className="text-right">크기</span>
        <span />
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto" data-testid="pg-upload-d-list">
        {drag.dragging && (
          <button
            type="button"
            data-testid="pg-upload-d-drop"
            onClick={drag.drop}
            className="mx-3 mt-2 flex h-11 w-[calc(100%-1.5rem)] items-center justify-center gap-2 rounded-md border-2 border-dashed border-primary/50 bg-primary/5 text-sm font-medium text-primary animate-in fade-in"
          >
            <ArrowDownToLine className="size-4" />
            {folder}
          </button>
        )}

        {[...failed, ...shown].map((u) => (
          <UploadRow
            key={u.id}
            u={u}
            expanded={openFolders.includes(u.id)}
            onToggle={() => setOpenFolders((l) => (l.includes(u.id) ? l.filter((x) => x !== u.id) : [...l, u.id]))}
            onCancel={() => up.cancel(u.id)}
            onRetry={() => up.retry(u.id)}
          />
        ))}

        {hidden > 0 && <MoreRow items={rest.slice(SHOW)} onExpand={() => setExpanded(true)} />}
        {expanded && rest.length > SHOW && (
          <button
            type="button"
            data-testid="pg-upload-d-collapse"
            onClick={() => setExpanded(false)}
            className="flex w-full items-center gap-2 border-b px-5 py-2 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            <ChevronDown className="size-3.5 rotate-180" />
            접기
          </button>
        )}

        {finished.map((u) => (
          <div key={u.id} className={cn(GRID, "border-b px-5 py-2.5 text-sm animate-in fade-in")}>
            <span className="flex min-w-0 items-center gap-3">
              <KindIcon kind={u.kind} />
              <span className="truncate text-foreground">{u.name}</span>
              <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                새 항목
              </span>
            </span>
            <span className="truncate text-xs text-muted-foreground">나</span>
            <span className="text-xs text-muted-foreground">방금</span>
            <span className="text-right text-xs text-muted-foreground tabular-nums">{formatBytes(u.size)}</span>
            <span />
          </div>
        ))}

        {nodes.map((n) => (
          <div
            key={n.id}
            data-testid={`pg-upload-d-row-${n.id}`}
            onClick={() => n.kind === "folder" && go(n.name)}
            className={cn(
              GRID,
              "border-b px-5 py-2.5 text-sm transition-colors hover:bg-muted/40",
              n.kind === "folder" && "cursor-pointer",
            )}
          >
            <span className="flex min-w-0 items-center gap-3">
              <KindIcon kind={n.kind} />
              <span className="truncate text-foreground">{n.name}</span>
              <FolderBadge items={up.items} name={n.kind === "folder" ? n.name : null} />
            </span>
            <span className="truncate text-xs text-muted-foreground">{memberOf(n.owner).name}</span>
            <span className="text-xs text-muted-foreground">{relativeTime(n.updatedAt)}</span>
            <span className="text-right text-xs text-muted-foreground tabular-nums">{formatBytes(n.size)}</span>
            <span />
          </div>
        ))}

        {nodes.length === 0 && here.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">빈 폴더</p>
        )}
      </div>
    </div>
  )
}

/** 접힌 업로드 묶음: "외 47개" */
function MoreRow({ items, onExpand }: { items: Up[]; onExpand: () => void }) {
  const s = summarize(items)
  return (
    <button
      type="button"
      data-testid="pg-upload-d-more"
      onClick={onExpand}
      className={cn(GRID, "relative w-full overflow-hidden border-b px-5 py-2.5 text-left text-sm hover:bg-muted/40")}
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-0 bg-primary/[0.05] transition-[width] duration-300"
        style={{ width: `${s.pct}%` }}
      />
      <span className="relative flex min-w-0 items-center gap-3 text-muted-foreground">
        <ChevronDown className="size-4 shrink-0" />
        <span className="text-foreground">외 {items.length}개</span>
      </span>
      <span />
      <span className="relative text-xs text-muted-foreground tabular-nums">
        {s.pct}%{s.eta > 0 && `, ${formatEta(s.eta)}`}
      </span>
      <span className="relative text-right text-xs text-muted-foreground tabular-nums">{formatBytes(s.total)}</span>
      <span />
    </button>
  )
}

/** 목록의 폴더 행: 그 안으로 올라가는 중이면 작은 진행 표시 */
function FolderBadge({ items, name }: { items: Up[]; name: string | null }) {
  if (!name) return null
  const inside = items.filter((u) => u.dest === name && (u.state === "uploading" || u.state === "queued" || u.state === "failed"))
  if (inside.length === 0) return null
  const s = summarize(inside)
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border py-0.5 pr-2 pl-0.5 text-[11px] tabular-nums",
        s.failed ? "border-rose-200 text-rose-600 dark:border-rose-900 dark:text-rose-400" : "text-muted-foreground",
      )}
    >
      <Ring pct={s.pct} size={14} stroke={2} />
      {inside.length}개 업로드 중
    </span>
  )
}

/** 앱 사이드바(실제로는 AppFrame sidebarExtra)에 붙는 업로드 표시. 플레이그라운드라 포털로 꽂는다 */
function SidebarIndicator({
  items,
  current,
  onGo,
  onRetryAll,
  onClear,
}: {
  items: Up[]
  current: string
  onGo: (folder: string) => void
  onRetryAll: () => void
  onClear: () => void
}) {
  const [target, setTarget] = useState<Element | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setTarget(document.querySelector("aside.md\\:block"))
  }, [])

  const live = items.filter((u) => u.state !== "canceled")
  const s = summarize(live)
  if (!target || live.length === 0) return null

  const busy = s.active > 0
  const groups = [...new Set(live.map((u) => u.dest))].map((dest) => {
    const g = live.filter((u) => u.dest === dest)
    return { dest, items: g, s: summarize(g) }
  })

  return createPortal(
    <div className="border-t p-3" data-testid="pg-upload-d-indicator">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="pg-upload-d-indicator-button"
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg border bg-background px-2.5 py-2 text-left shadow-xs transition-colors hover:bg-muted/60",
              s.failed > 0 && "border-rose-200 dark:border-rose-900",
            )}
          >
            {busy ? (
              <Ring pct={s.pct} size={22} stroke={2.5} />
            ) : s.failed > 0 ? (
              <CircleAlert className="size-5 text-rose-600 dark:text-rose-400" />
            ) : (
              <CircleCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {busy ? `업로드 ${s.active}개` : s.failed > 0 ? "업로드 실패" : "업로드 완료"}
              </span>
              <span
                className={cn(
                  "block truncate text-xs tabular-nums",
                  s.failed > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
                )}
              >
                {busy
                  ? [`${s.pct}%`, formatEta(s.eta), s.failed > 0 && `실패 ${s.failed}`].filter(Boolean).join(", ")
                  : s.failed > 0
                    ? `${s.failed}개`
                    : `${s.done}개`}
              </span>
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="end" className="w-72 p-0" data-testid="pg-upload-d-indicator-popover">
          <div className="flex items-center justify-between border-b px-3 py-2.5">
            <span className="text-sm font-medium">업로드</span>
            <span className="flex items-center gap-1">
              {s.failed > 0 && (
                <button
                  type="button"
                  data-testid="pg-upload-d-retry-all"
                  onClick={onRetryAll}
                  className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50"
                >
                  모두 재시도
                </button>
              )}
              {!busy && (
                <button
                  type="button"
                  data-testid="pg-upload-d-clear"
                  onClick={() => {
                    onClear()
                    setOpen(false)
                  }}
                  title="지우기"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </span>
          </div>
          <ul className="p-1.5">
            {groups.map((g) => (
              <li key={g.dest}>
                <button
                  type="button"
                  data-testid={`pg-upload-d-go-${g.dest}`}
                  onClick={() => {
                    onGo(g.dest)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-muted",
                    g.dest === current && "bg-muted/60",
                  )}
                >
                  <KindIcon kind="folder" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{g.dest}</span>
                    <span
                      className={cn(
                        "block text-xs tabular-nums",
                        g.s.failed ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
                      )}
                    >
                      {g.items.length}개
                      {g.s.active > 0 ? `, ${g.s.pct}%` : g.s.failed > 0 ? `, 실패 ${g.s.failed}` : ", 완료"}
                    </span>
                  </span>
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>,
    target,
  )
}
