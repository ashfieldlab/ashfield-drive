"use client"

import { useState } from "react"
import { ArrowDownToLine, ChevronRight, FolderUp, MousePointerClick, RotateCw, Upload, X } from "lucide-react"

import { cn } from "@/lib/utils"

import { NODES, formatBytes, memberOf, relativeTime } from "../_mock"
import { KindIcon, Ring, filesDone, formatEta, pctOf, speedOf, summarize, useDragState, useUploads, type Upload as Up } from "./shared"

const ROOT = NODES.filter((n) => !n.parentId)
const HOVER_FOLDER = "f-design"

const GRID = "grid grid-cols-[minmax(0,1fr)_112px_200px_120px_40px] items-center gap-3"

/** 폴더 업로드 펼침용 가짜 하위 파일 */
const CHILDREN = ["tokens.json", "colors.png", "type-scale.png", "buttons.fig", "icons/", "README.md"]

/** B: 목록 안에 바로 끼워 넣는 업로드 행 */
export function VariantB() {
  const up = useUploads()
  const drag = useDragState(up.addFiles)
  const [openFolders, setOpenFolders] = useState<string[]>(["u3"])
  const s = summarize(up.items)
  const visible = up.items.filter((u) => u.state !== "done" && u.state !== "canceled")
  const finished = up.items.filter((u) => u.state === "done")

  return (
    <div
      {...drag.handlers}
      className="relative flex h-[calc(100dvh-3.5rem-3rem-3rem)] min-h-[560px] flex-col overflow-hidden rounded-xl border bg-background"
    >
      <div className="flex h-14 shrink-0 items-center gap-3 px-5">
        <p className="text-base font-semibold text-foreground">내 파일</p>
        {s.active > 0 && (
          <span className="inline-flex items-center gap-2 rounded-full border py-0.5 pl-1 pr-2.5 text-xs text-muted-foreground tabular-nums">
            <Ring pct={s.pct} size={18} stroke={2.5} />
            {s.active}개, {s.pct}%, {formatEta(s.eta)}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            data-testid="pg-upload-b-drag-toggle"
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
            data-testid="pg-upload-b-folder"
            onClick={up.addFolder}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            <FolderUp className="size-3.5" />
            폴더 업로드
          </button>
          <button
            type="button"
            data-testid="pg-upload-b-files"
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

      <div className="relative min-h-0 flex-1 overflow-auto" data-testid="pg-upload-b-list">
        {drag.dragging && (
          <button
            type="button"
            data-testid="pg-upload-b-drop"
            onClick={drag.drop}
            className="mx-3 mt-2 flex h-11 w-[calc(100%-1.5rem)] items-center justify-center gap-2 rounded-md border-2 border-dashed border-primary/50 bg-primary/5 text-sm font-medium text-primary animate-in fade-in"
          >
            <ArrowDownToLine className="size-4" />
            내 파일
          </button>
        )}

        {visible.map((u) => (
          <UploadRow
            key={u.id}
            u={u}
            expanded={openFolders.includes(u.id)}
            onToggle={() => setOpenFolders((l) => (l.includes(u.id) ? l.filter((x) => x !== u.id) : [...l, u.id]))}
            onCancel={() => up.cancel(u.id)}
            onRetry={() => up.retry(u.id)}
          />
        ))}

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

        {ROOT.map((n) => {
          const target = drag.dragging && n.id === HOVER_FOLDER
          return (
            <div
              key={n.id}
              className={cn(
                GRID,
                "relative border-b px-5 py-2.5 text-sm transition-colors",
                target ? "bg-primary/10" : "hover:bg-muted/40",
                drag.dragging && n.kind !== "folder" && "opacity-50",
              )}
            >
              {target && <span className="pointer-events-none absolute inset-0 rounded-sm ring-2 ring-inset ring-primary" />}
              <span className="flex min-w-0 items-center gap-3">
                <KindIcon kind={n.kind} />
                <span className="truncate text-foreground">{n.name}</span>
                {target && (
                  <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                    디자인에 업로드
                  </span>
                )}
              </span>
              <span className="truncate text-xs text-muted-foreground">{memberOf(n.owner).name}</span>
              <span className="text-xs text-muted-foreground">{relativeTime(n.updatedAt)}</span>
              <span className="text-right text-xs text-muted-foreground tabular-nums">{formatBytes(n.size)}</span>
              <span />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function UploadRow({
  u,
  expanded,
  onToggle,
  onCancel,
  onRetry,
}: {
  u: Up
  expanded: boolean
  onToggle: () => void
  onCancel: () => void
  onRetry: () => void
}) {
  const pct = pctOf(u)
  const failed = u.state === "failed"
  const done = filesDone(u)
  return (
    <>
      <div
        className={cn(
          GRID,
          "relative overflow-hidden border-b px-5 py-2.5 text-sm",
          failed && "bg-rose-50/70 dark:bg-rose-950/30",
        )}
      >
        {/* 행 배경이 진행률만큼 차오른다 */}
        {!failed && (
          <span
            className="pointer-events-none absolute inset-y-0 left-0 bg-primary/[0.07] transition-[width] duration-300 dark:bg-primary/10"
            style={{ width: `${pct}%` }}
          />
        )}
        <span
          className={cn(
            "pointer-events-none absolute bottom-0 left-0 h-0.5 transition-[width] duration-300",
            failed ? "bg-rose-500 dark:bg-rose-400" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
        <span className="relative flex min-w-0 items-center gap-3">
          {u.files ? (
            <button
              type="button"
              data-testid={`pg-upload-b-expand-${u.id}`}
              onClick={onToggle}
              className="-ml-1 flex items-center gap-1 rounded text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
              <KindIcon kind={u.kind} />
            </button>
          ) : (
            <KindIcon kind={u.kind} className={cn(u.state === "queued" && "opacity-50")} />
          )}
          <span className={cn("truncate", u.state === "queued" ? "text-muted-foreground" : "text-foreground")}>{u.name}</span>
          {u.files && (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {done} / {u.files}
            </span>
          )}
        </span>
        <span className="relative truncate text-xs text-muted-foreground">나</span>
        <span
          className={cn(
            "relative truncate text-xs tabular-nums",
            failed ? "font-medium text-rose-600 dark:text-rose-400" : "text-muted-foreground",
          )}
        >
          {u.state === "uploading" && `${pct}%, ${speedOf(u.speed)}, ${formatEta((u.size - u.loaded) / u.speed)}`}
          {u.state === "queued" && "대기 중"}
          {failed && u.error}
        </span>
        <span className="relative text-right text-xs text-muted-foreground tabular-nums">
          {u.state === "queued" ? formatBytes(u.size) : `${formatBytes(u.loaded)} / ${formatBytes(u.size)}`}
        </span>
        <span className="relative flex justify-end">
          {failed ? (
            <button
              type="button"
              data-testid={`pg-upload-b-retry-${u.id}`}
              onClick={onRetry}
              title="재시도"
              className="rounded-md p-1.5 text-rose-600 hover:bg-rose-100 dark:text-rose-400 dark:hover:bg-rose-900/40"
            >
              <RotateCw className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              data-testid={`pg-upload-b-cancel-${u.id}`}
              onClick={onCancel}
              title="취소"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </span>
      </div>
      {u.files && expanded && (
        <div className="border-b bg-muted/20 py-1">
          {CHILDREN.map((c, i) => {
            const state = i < Math.round((done / u.files!) * CHILDREN.length) ? "done" : i === Math.round((done / u.files!) * CHILDREN.length) ? "uploading" : "queued"
            return (
              <div key={c} className={cn(GRID, "px-5 py-1.5 text-xs")}>
                <span className="flex min-w-0 items-center gap-2 pl-12">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      state === "done" && "bg-emerald-500 dark:bg-emerald-400",
                      state === "uploading" && "animate-pulse bg-primary",
                      state === "queued" && "bg-muted-foreground/30",
                    )}
                  />
                  <span className={cn("truncate", state === "queued" ? "text-muted-foreground" : "text-foreground")}>
                    {c}
                  </span>
                </span>
                <span />
                <span className="text-muted-foreground">{state === "done" ? "완료" : state === "uploading" ? "업로드 중" : "대기 중"}</span>
                <span />
                <span />
              </div>
            )
          })}
          <p className="py-1 pl-[76px] text-[11px] text-muted-foreground">외 {u.files - CHILDREN.length}개</p>
        </div>
      )}
    </>
  )
}
