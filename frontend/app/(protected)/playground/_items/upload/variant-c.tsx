"use client"

import { useState } from "react"
import { Check, ChevronDown, CloudUpload, Folder, FolderUp, MousePointerClick, RotateCw, Upload, X } from "lucide-react"

import { cn } from "@/lib/utils"

import { NODES, formatBytes } from "../_mock"
import { Bar, KindIcon, filesDone, formatEta, pctOf, speedOf, summarize, useDragState, useUploads, type Upload as Up } from "./shared"

const ROOT = NODES.filter((n) => !n.parentId)
const FOLDERS = ROOT.filter((n) => n.kind === "folder")

/** C: 상단 진행 배너(펼치면 상세 표) + 전체 화면 드롭 영역 */
export function VariantC() {
  const up = useUploads()
  const [target, setTarget] = useState("root")
  const drag = useDragState(up.addFiles)
  const [expanded, setExpanded] = useState(true)
  const s = summarize(up.items)
  const busy = s.active > 0

  return (
    <div
      {...drag.handlers}
      className="relative h-[calc(100dvh-3.5rem-3rem-3rem)] min-h-[560px] overflow-hidden rounded-xl border bg-background"
    >
      <div className="flex h-full flex-col">
        {/* 배너 */}
        <div className="shrink-0 border-b bg-card">
          <div className="flex items-center gap-4 px-5 py-3">
            <div
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-lg",
                busy ? "bg-primary/10 text-primary" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400",
              )}
            >
              {busy ? <CloudUpload className="size-[18px]" /> : <Check className="size-[18px]" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="font-medium text-foreground">{busy ? "업로드 중" : "업로드 완료"}</span>
                <span className="text-muted-foreground tabular-nums">
                  {s.done} / {s.count}개
                </span>
                {s.failed > 0 && (
                  <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    실패 {s.failed}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {formatBytes(s.loaded)} / {formatBytes(s.total)}
                  {busy && `, ${speedOf(s.speed)}, ${formatEta(s.eta)}`}
                </span>
              </div>
              {/* 파일별 세그먼트 막대 */}
              <div className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
                {up.items
                  .filter((u) => u.state !== "canceled")
                  .map((u) => (
                    <div
                      key={u.id}
                      className="relative h-full overflow-hidden bg-muted"
                      style={{ flexGrow: Math.max(1, Math.log2(u.size / 1024)), flexBasis: 0 }}
                      title={u.name}
                    >
                      <div
                        className={cn(
                          "absolute inset-y-0 left-0 transition-[width] duration-300",
                          u.state === "failed" ? "bg-rose-500 dark:bg-rose-400" : u.state === "done" ? "bg-emerald-500 dark:bg-emerald-400" : "bg-primary",
                        )}
                        style={{ width: `${pctOf(u)}%` }}
                      />
                    </div>
                  ))}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {s.failed > 0 && (
                <button
                  type="button"
                  data-testid="pg-upload-c-retry-all"
                  onClick={up.retryAll}
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/50"
                >
                  <RotateCw className="size-3" />
                  재시도
                </button>
              )}
              {busy && (
                <button
                  type="button"
                  data-testid="pg-upload-c-cancel-all"
                  onClick={up.cancelAll}
                  className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  모두 취소
                </button>
              )}
              <button
                type="button"
                data-testid="pg-upload-c-expand"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs text-foreground hover:bg-muted"
              >
                상세
                <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
              </button>
            </div>
          </div>

          {expanded && (
            <div className="max-h-[300px] overflow-auto border-t animate-in slide-in-from-top-1 fade-in">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pl-5 font-medium">이름</th>
                    <th className="w-28 font-medium">위치</th>
                    <th className="w-44 font-medium">진행</th>
                    <th className="w-28 text-right font-medium">속도</th>
                    <th className="w-28 text-right font-medium">상태</th>
                    <th className="w-14 pr-3" />
                  </tr>
                </thead>
                <tbody>
                  {up.items.map((u) => (
                    <DetailRow key={u.id} u={u} onCancel={() => up.cancel(u.id)} onRetry={() => up.retry(u.id)} onRemove={() => up.remove(u.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 툴바 + 카드 그리드 */}
        <div className="flex h-14 shrink-0 items-center gap-2 px-5">
          <p className="text-base font-semibold text-foreground">내 파일</p>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              data-testid="pg-upload-c-drag-toggle"
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
              data-testid="pg-upload-c-folder"
              onClick={up.addFolder}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            >
              <FolderUp className="size-3.5" />
              폴더 업로드
            </button>
            <button
              type="button"
              data-testid="pg-upload-c-files"
              onClick={up.addFiles}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Upload className="size-3.5" />
              업로드
            </button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 overflow-auto px-5 pb-5">
          {ROOT.map((n) => (
            <div key={n.id} className="overflow-hidden rounded-lg border bg-card">
              <div className="grid h-20 place-items-center bg-muted/50" style={n.thumb ? { background: n.thumb } : undefined}>
                {!n.thumb && <KindIcon kind={n.kind} className="size-6" />}
              </div>
              <div className="px-3 py-2">
                <p className="truncate text-xs font-medium text-foreground">{n.name}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">{formatBytes(n.size)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 전체 드롭 영역 */}
      {drag.dragging && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-background/80 p-8 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-2xl">
            <button
              type="button"
              data-testid="pg-upload-c-drop-root"
              onClick={() => setTarget("root")}
              onDoubleClick={drag.drop}
              className={cn(
                "flex h-52 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-colors",
                target === "root" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40",
              )}
            >
              <span className={cn("grid size-14 place-items-center rounded-full", target === "root" ? "bg-primary text-primary-foreground" : "bg-muted")}>
                <CloudUpload className="size-7" />
              </span>
              <span className="text-base font-semibold text-foreground">내 파일</span>
            </button>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {FOLDERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  data-testid={`pg-upload-c-drop-${f.id}`}
                  onClick={() => setTarget(f.id)}
                  onDoubleClick={drag.drop}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-2 py-3 text-xs transition-colors",
                    target === f.id ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-primary/40",
                  )}
                >
                  <Folder className={cn("size-5", target === f.id ? "fill-primary/20 text-primary" : "")} />
                  <span className="w-full truncate">{f.name}</span>
                </button>
              ))}
            </div>
            <div className="mt-5 flex justify-center gap-2">
              <button
                type="button"
                data-testid="pg-upload-c-drop-cancel"
                onClick={drag.toggle}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                닫기
              </button>
              <button
                type="button"
                data-testid="pg-upload-c-drop"
                onClick={drag.drop}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                놓기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailRow({ u, onCancel, onRetry, onRemove }: { u: Up; onCancel: () => void; onRetry: () => void; onRemove: () => void }) {
  const pct = pctOf(u)
  const failed = u.state === "failed"
  return (
    <tr className={cn("border-b last:border-0", failed && "bg-rose-50/60 dark:bg-rose-950/20", u.state === "canceled" && "opacity-50")}>
      <td className="py-2 pl-5">
        <span className="flex min-w-0 items-center gap-2.5">
          <KindIcon kind={u.kind} />
          <span className="truncate text-foreground">{u.name}</span>
          {u.files && (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {filesDone(u)}/{u.files}
            </span>
          )}
        </span>
      </td>
      <td className="truncate text-xs text-muted-foreground">{u.dest}</td>
      <td className="pr-4">
        <div className="flex items-center gap-2">
          <Bar pct={pct} tone={failed ? "rose" : u.state === "done" ? "emerald" : "primary"} className="flex-1" />
          <span className="w-9 text-right text-[11px] text-muted-foreground tabular-nums">{pct}%</span>
        </div>
      </td>
      <td className="text-right text-xs text-muted-foreground tabular-nums">{u.state === "uploading" ? speedOf(u.speed) : ""}</td>
      <td
        className={cn(
          "text-right text-xs",
          failed ? "font-medium text-rose-600 dark:text-rose-400" : u.state === "done" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
        )}
      >
        {u.state === "uploading" && formatEta((u.size - u.loaded) / u.speed)}
        {u.state === "queued" && "대기 중"}
        {u.state === "done" && "완료"}
        {u.state === "canceled" && "취소됨"}
        {failed && u.error}
      </td>
      <td className="pr-3 text-right">
        {failed ? (
          <button
            type="button"
            data-testid={`pg-upload-c-retry-${u.id}`}
            onClick={onRetry}
            title="재시도"
            className="rounded-md p-1.5 text-rose-600 hover:bg-rose-100 dark:text-rose-400 dark:hover:bg-rose-900/40"
          >
            <RotateCw className="size-3.5" />
          </button>
        ) : (
          <button
            type="button"
            data-testid={`pg-upload-c-row-${u.id}-x`}
            onClick={u.state === "uploading" || u.state === "queued" ? onCancel : onRemove}
            title={u.state === "uploading" || u.state === "queued" ? "취소" : "지우기"}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </td>
    </tr>
  )
}
