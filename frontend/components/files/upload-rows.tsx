"use client"

/**
 * 목록 안 업로드 진행 행 (playground upload D).
 *
 * 행 배경이 진행률만큼 차오르고, 실패는 rose 로 위에 고정, 업로드 중이 대기보다 먼저,
 * SHOW_ROWS 를 넘으면 "외 N개" 한 줄로 묶는다. 폴더 업로드는 한 행(펼치면 하위 파일).
 * 표(<tr>) 안에 끼워 넣으므로 열 구성은 files-list 의 표와 같다:
 *   [선택] [이름] [크기] [수정] [작업]
 */

import { useState } from "react"
import { ChevronDown, ChevronRight, RotateCw, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatBytes } from "@/lib/utils/format"
import { cancel, retry, type UploadItem } from "@/lib/uploads/store"
import { arrangeRows, formatEta, pctOf, summarize } from "@/lib/uploads/view"
import { KindIcon, KIND, kindOf } from "@/components/files/file-meta"

/** 진행 링 */
export function Ring({ pct, size = 28, stroke = 2.5, className }: { pct: number; size?: number; stroke?: number; className?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className={cn("shrink-0 -rotate-90", className)} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        className="stroke-primary transition-[stroke-dashoffset] duration-300"
      />
    </svg>
  )
}

const speedOf = (bps: number) => `${formatBytes(Math.round(bps))}/s`

// 행 배경 채움: <tr> 배경은 셀 전체 뒤로 그려지므로 그라디언트 두 겹(옅은 채움 + 아래 2px 선).
function fillStyle(pct: number, failed: boolean): React.CSSProperties {
  const line = failed ? "var(--color-rose-500)" : "var(--primary)"
  const layers = [`linear-gradient(to right, ${line} ${pct}%, transparent ${pct}%)`]
  const sizes = ["100% 2px"]
  if (!failed) {
    layers.push(
      `linear-gradient(to right, color-mix(in oklab, var(--primary) 8%, transparent) ${pct}%, transparent ${pct}%)`,
    )
    sizes.push("100% 100%")
  }
  return {
    backgroundImage: layers.join(", "),
    backgroundSize: sizes.join(", "),
    backgroundPosition: "left bottom, left top",
    backgroundRepeat: "no-repeat",
  }
}

interface Props {
  /** 이 폴더(목적지)로 가는 업로드만 */
  items: UploadItem[]
  /** 표의 열 수 (colSpan 용) */
  cols: number
  /** 선택 열이 있는지 (갤러리 위 작은 표는 없음) */
  withSelect?: boolean
}

export function UploadRows({ items, cols, withSelect = true }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [open, setOpen] = useState<string[]>([])
  const { failed, shown, hidden } = arrangeRows(items, expanded)
  const rest = shown.length + hidden.length

  return (
    <>
      {[...failed, ...shown].map((u) => (
        <UploadRow
          key={u.id}
          u={u}
          cols={cols}
          withSelect={withSelect}
          expanded={open.includes(u.id)}
          onToggle={() => setOpen((l) => (l.includes(u.id) ? l.filter((x) => x !== u.id) : [...l, u.id]))}
        />
      ))}
      {hidden.length > 0 && <MoreRow items={hidden} withSelect={withSelect} onExpand={() => setExpanded(true)} />}
      {expanded && rest > 3 && (
        <tr className="border-b border-border">
          <td colSpan={cols} className="p-0">
            <button
              type="button"
              data-testid="files-upload-collapse"
              onClick={() => setExpanded(false)}
              className="flex w-full items-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              <ChevronDown className="size-3.5 rotate-180" />
              접기
            </button>
          </td>
        </tr>
      )}
    </>
  )
}

function UploadRow({
  u,
  cols,
  withSelect,
  expanded,
  onToggle,
}: {
  u: UploadItem
  cols: number
  withSelect: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const pct = pctOf(u)
  const failed = u.state === "failed"
  const isFolder = u.kind === "folder"
  const kind = kindOf(u.name, u.mime, isFolder)
  const files = u.children?.length ?? 0
  const remain = u.speed > 0 ? (u.size - u.loaded) / u.speed : 0

  return (
    <>
      <tr
        data-testid={`files-upload-row-${u.id}`}
        data-state={u.state}
        className={cn("h-12 border-b border-border text-sm", failed && "bg-rose-50/70 dark:bg-rose-950/30")}
        style={fillStyle(failed ? Math.max(pct, 2) : pct, failed)}
      >
        {withSelect && (
          <td className="pl-4">
            {isFolder && (
              <button
                type="button"
                data-testid={`files-upload-row-${u.id}-expand`}
                onClick={onToggle}
                aria-label={expanded ? "접기" : "펼치기"}
                className="flex size-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
              </button>
            )}
          </td>
        )}
        <td className={cn("max-w-0 pr-3", !withSelect && "pl-4")}>
          <span className="flex min-w-0 items-center gap-3">
            {!withSelect && isFolder ? (
              <button
                type="button"
                data-testid={`files-upload-row-${u.id}-expand`}
                onClick={onToggle}
                className="-ml-1 flex items-center gap-1 rounded text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
                <KindIcon kind={kind} className={cn("size-4", KIND[kind].fg)} />
              </button>
            ) : (
              <span className={cn("flex size-8 shrink-0 items-center justify-center", u.state === "queued" && "opacity-50")}>
                <KindIcon kind={kind} className={cn("size-4", KIND[kind].fg)} />
              </span>
            )}
            <span className={cn("truncate", u.state === "queued" ? "text-muted-foreground" : "font-medium text-foreground")} title={u.name}>
              {u.name}
            </span>
            {isFolder && (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {u.filesDone ?? 0} / {files}
              </span>
            )}
          </span>
        </td>
        <td className="hidden pr-4 text-right text-xs text-muted-foreground tabular-nums sm:table-cell">
          {u.state === "queued" ? formatBytes(u.size) : `${formatBytes(u.loaded)} / ${formatBytes(u.size)}`}
        </td>
        <td
          className={cn(
            "truncate pr-2 text-right text-xs tabular-nums",
            failed ? "font-medium text-rose-600 dark:text-rose-400" : "text-muted-foreground",
          )}
          title={failed ? u.error : undefined}
        >
          {u.state === "uploading" && (
            <>
              {pct}%
              <span className="hidden sm:inline">
                {[u.speed > 0 && speedOf(u.speed), formatEta(remain)].filter(Boolean).map((t) => `, ${t}`).join("")}
              </span>
            </>
          )}
          {u.state === "queued" && "대기 중"}
          {failed && (u.error || "실패")}
        </td>
        <td className="pr-3">
          <span className="flex justify-end">
            {failed ? (
              <button
                type="button"
                data-testid={`files-upload-row-${u.id}-retry`}
                onClick={() => retry(u.id)}
                title="재시도"
                aria-label="재시도"
                className="rounded-md p-1.5 text-rose-600 hover:bg-rose-100 dark:text-rose-400 dark:hover:bg-rose-900/40"
              >
                <RotateCw className="size-3.5" />
              </button>
            ) : (
              <button
                type="button"
                data-testid={`files-upload-row-${u.id}-cancel`}
                onClick={() => cancel(u.id)}
                title="취소"
                aria-label="취소"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </span>
        </td>
      </tr>
      {isFolder && expanded && <FolderChildren u={u} cols={cols} />}
    </>
  )
}

const CHILD_SHOW = 8
const CHILD_ORDER = { failed: 0, uploading: 1, queued: 2, done: 3 } as const
const CHILD_LABEL = { failed: "실패", uploading: "업로드 중", queued: "대기 중", done: "완료" } as const

function FolderChildren({ u, cols }: { u: UploadItem; cols: number }) {
  const all = [...(u.children ?? [])].sort((a, b) => CHILD_ORDER[a.state] - CHILD_ORDER[b.state])
  const shown = all.slice(0, CHILD_SHOW)
  return (
    <tr className="border-b border-border bg-muted/20" data-testid={`files-upload-row-${u.id}-children`}>
      <td colSpan={cols} className="py-1">
        {shown.map((c) => (
          <div key={c.path} className="flex items-center gap-2 py-1 pr-14 pl-[5.25rem] text-xs">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                c.state === "done" && "bg-emerald-500 dark:bg-emerald-400",
                c.state === "uploading" && "animate-pulse bg-primary",
                c.state === "queued" && "bg-muted-foreground/30",
                c.state === "failed" && "bg-rose-500 dark:bg-rose-400",
              )}
            />
            <span className={cn("min-w-0 flex-1 truncate", c.state === "queued" ? "text-muted-foreground" : "text-foreground")}>
              {c.path}
            </span>
            <span className={cn("shrink-0", c.state === "failed" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
              {CHILD_LABEL[c.state]}
            </span>
          </div>
        ))}
        {all.length > shown.length && (
          <p className="py-1 pl-[5.25rem] text-[11px] text-muted-foreground">외 {all.length - shown.length}개</p>
        )}
      </td>
    </tr>
  )
}

/** 접힌 업로드 묶음: "외 N개" */
function MoreRow({ items, withSelect, onExpand }: { items: UploadItem[]; withSelect: boolean; onExpand: () => void }) {
  const s = summarize(items)
  return (
    <tr
      data-testid="files-upload-more"
      onClick={onExpand}
      className="h-11 cursor-pointer border-b border-border text-sm hover:bg-muted/40"
      style={{
        backgroundImage: `linear-gradient(to right, color-mix(in oklab, var(--primary) 5%, transparent) ${s.pct}%, transparent ${s.pct}%)`,
      }}
    >
      {withSelect && <td />}
      <td className={cn("pr-3", !withSelect && "pl-4")}>
        <button
          type="button"
          data-testid="files-upload-more-button"
          className="flex min-w-0 items-center gap-3 text-muted-foreground"
        >
          <span className="flex size-8 shrink-0 items-center justify-center">
            <ChevronDown className="size-4" />
          </span>
          <span className="text-foreground">외 {items.length}개</span>
        </button>
      </td>
      <td className="hidden pr-4 text-right text-xs text-muted-foreground tabular-nums sm:table-cell">{formatBytes(s.total)}</td>
      <td className="truncate pr-2 text-right text-xs text-muted-foreground tabular-nums">
        {[`${s.pct}%`, formatEta(s.eta)].filter(Boolean).join(", ")}
      </td>
      <td />
    </tr>
  )
}

/** 폴더 행: 그 안으로 올라가는 중이면 작은 진행 표시 */
export function FolderUploadBadge({ items }: { items: UploadItem[] }) {
  const inside = items.filter((u) => u.state === "uploading" || u.state === "queued" || u.state === "failed")
  if (inside.length === 0) return null
  const s = summarize(inside)
  const busy = s.active > 0
  return (
    <span
      data-testid="files-folder-upload-badge"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border py-0.5 pr-2 pl-0.5 text-[11px] tabular-nums",
        s.failed ? "border-rose-200 text-rose-600 dark:border-rose-900 dark:text-rose-400" : "text-muted-foreground",
      )}
    >
      <Ring pct={s.pct} size={14} stroke={2} />
      {busy ? `${s.active}개 업로드 중` : `실패 ${s.failed}`}
    </span>
  )
}
