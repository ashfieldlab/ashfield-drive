"use client"

import { useState } from "react"
import { Check, ChevronDown, CloudUpload, FolderUp, MousePointerClick, RotateCw, Upload, X } from "lucide-react"

import { cn } from "@/lib/utils"

import { NODES, formatBytes, relativeTime } from "../_mock"
import { Bar, KindIcon, Ring, filesDone, formatEta, pctOf, speedOf, summarize, useDragState, useUploads, type Upload as Up } from "./shared"

const ROOT = NODES.filter((n) => !n.parentId)

/** A: 오른쪽 아래 떠 있는 업로드 트레이 (접기 가능) */
export function VariantA() {
  const up = useUploads()
  const drag = useDragState(up.addFiles)
  const [collapsed, setCollapsed] = useState(false)
  const [hidden, setHidden] = useState(false)
  const s = summarize(up.items)
  const busy = s.active > 0

  return (
    <div
      {...drag.handlers}
      className="relative h-[calc(100dvh-3.5rem-3rem-3rem)] min-h-[560px] overflow-hidden rounded-xl border bg-background"
    >
      <div className="flex h-full flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b px-5">
          <p className="text-base font-semibold text-foreground">내 파일</p>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              data-testid="pg-upload-a-drag-toggle"
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
              data-testid="pg-upload-a-folder"
              onClick={() => {
                up.addFolder()
                setHidden(false)
                setCollapsed(false)
              }}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            >
              <FolderUp className="size-3.5" />
              폴더 업로드
            </button>
            <button
              type="button"
              data-testid="pg-upload-a-files"
              onClick={() => {
                up.addFiles()
                setHidden(false)
                setCollapsed(false)
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Upload className="size-3.5" />
              업로드
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
          {ROOT.map((n) => (
            <div key={n.id} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted/50">
              <KindIcon kind={n.kind} />
              <span className="flex-1 truncate text-foreground">{n.name}</span>
              <span className="w-24 text-xs text-muted-foreground">{relativeTime(n.updatedAt)}</span>
              <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">{formatBytes(n.size)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 드래그 오버 */}
      {drag.dragging && (
        <div className="absolute inset-0 z-40 animate-in fade-in duration-150">
          <div className="absolute inset-2 rounded-lg bg-primary/[0.06] ring-2 ring-primary dark:bg-primary/10" />
          <button
            type="button"
            data-testid="pg-upload-a-drop"
            onClick={drag.drop}
            className="absolute left-1/2 top-[38%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-full bg-primary py-2.5 pl-4 pr-5 text-sm font-medium text-primary-foreground shadow-xl animate-in zoom-in-95"
          >
            <CloudUpload className="size-5" />
            내 파일에 업로드
          </button>
        </div>
      )}

      {/* 트레이 */}
      {!hidden && up.items.length > 0 && (
        <div
          className={cn(
            "absolute bottom-4 right-4 z-30 w-[380px] overflow-hidden rounded-xl border bg-card shadow-2xl transition-opacity",
            drag.dragging && "pointer-events-none",
          )}
        >
          <div className="flex items-center gap-2 bg-muted/60 py-2.5 pl-4 pr-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {busy ? `${s.active}개 업로드 중` : s.failed ? `${s.failed}개 실패` : `${s.done}개 업로드 완료`}
              </p>
              {busy && (
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {speedOf(s.speed)}, {formatEta(s.eta)}
                </p>
              )}
            </div>
            <button
              type="button"
              data-testid="pg-upload-a-collapse"
              onClick={() => setCollapsed((v) => !v)}
              title={collapsed ? "펼치기" : "접기"}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronDown className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
            </button>
            <button
              type="button"
              data-testid="pg-upload-a-close"
              onClick={() => {
                if (busy) up.cancelAll()
                else setHidden(true)
              }}
              title={busy ? "모두 취소" : "닫기"}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          {busy && <Bar pct={s.pct} className="h-0.5 rounded-none" />}

          {!collapsed && (
            <>
              <ul className="max-h-[300px] overflow-auto py-1">
                {up.items.map((u) => (
                  <TrayRow key={u.id} u={u} onCancel={() => up.cancel(u.id)} onRetry={() => up.retry(u.id)} onRemove={() => up.remove(u.id)} />
                ))}
              </ul>
              {(s.failed > 0 || s.done > 0) && (
                <div className="flex items-center justify-between border-t px-4 py-2 text-xs">
                  {s.failed > 0 ? (
                    <button
                      type="button"
                      data-testid="pg-upload-a-retry-all"
                      onClick={up.retryAll}
                      className="inline-flex items-center gap-1 font-medium text-rose-600 hover:underline dark:text-rose-400"
                    >
                      <RotateCw className="size-3" />
                      실패 {s.failed}개 재시도
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    data-testid="pg-upload-a-clear"
                    onClick={up.clearFinished}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    완료 항목 지우기
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function TrayRow({ u, onCancel, onRetry, onRemove }: { u: Up; onCancel: () => void; onRetry: () => void; onRemove: () => void }) {
  const pct = pctOf(u)
  return (
    <li className="group flex items-center gap-3 px-4 py-2 hover:bg-muted/40">
      <div className="relative grid size-8 shrink-0 place-items-center">
        {u.state === "uploading" && <Ring pct={pct} size={32} className="absolute inset-0" />}
        <KindIcon kind={u.kind} className={cn(u.state === "canceled" && "opacity-40")} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm text-foreground", u.state === "canceled" && "text-muted-foreground line-through")}>{u.name}</p>
        <p
          className={cn(
            "truncate text-[11px] tabular-nums",
            u.state === "failed" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
          )}
        >
          {u.state === "uploading" &&
            (u.files
              ? `${filesDone(u)} / ${u.files}개, ${speedOf(u.speed)}`
              : `${formatBytes(u.loaded)} / ${formatBytes(u.size)}, ${speedOf(u.speed)}`)}
          {u.state === "queued" && "대기 중"}
          {u.state === "done" && (u.files ? `${u.files}개, ${formatBytes(u.size)}` : formatBytes(u.size))}
          {u.state === "failed" && u.error}
          {u.state === "canceled" && "취소됨"}
        </p>
      </div>
      {u.state === "done" && (
        <span className="grid size-6 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
          <Check className="size-3.5" />
        </span>
      )}
      {u.state === "failed" && (
        <button
          type="button"
          data-testid={`pg-upload-a-retry-${u.id}`}
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/50"
        >
          <RotateCw className="size-3" />
          재시도
        </button>
      )}
      {(u.state === "uploading" || u.state === "queued") && (
        <button
          type="button"
          data-testid={`pg-upload-a-cancel-${u.id}`}
          onClick={onCancel}
          title="취소"
          className="rounded-md p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
      {u.state === "canceled" && (
        <button
          type="button"
          data-testid={`pg-upload-a-remove-${u.id}`}
          onClick={onRemove}
          title="지우기"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </li>
  )
}
