"use client"

import { useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Info,
  Maximize2,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Share2,
  Trash2,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"

import { InfoPanel, SharePanel, VersionsPanel } from "./panels"
import { FILES, FakeFileList, KIND_META, KindIcon, PreviewBody, pathOf, usePreviewNav } from "./shared"

const SLUG = "file-preview"
const ZOOMS = [50, 75, 100, 125, 150, 200]

/** C: 떠 있는 창, 왼쪽 미리보기 + 오른쪽 정보/버전/공유 패널 */
export function VariantC() {
  const [open, setOpen] = useState(true)
  const [deleted, setDeleted] = useState<string[]>([])
  const files = FILES.filter((f) => !deleted.includes(f.id))
  const { index, prev, next } = usePreviewNav(files.length, () => setOpen(false))
  const [zoom, setZoom] = useState(2)
  const [side, setSide] = useState(true)
  const [section, setSection] = useState<"info" | "versions" | "share">("info")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const node = files[Math.min(index, files.length - 1)]
  const zoomable = node && ["image", "pdf", "doc", "slide", "sheet"].includes(node.kind)

  return (
    <div className="relative h-[calc(100dvh-3.5rem-3rem-3rem)] min-h-[560px] overflow-hidden rounded-xl">
      <div className="absolute inset-0 overflow-hidden p-6">
        <FakeFileList />
      </div>
      {!open && (
        <div className="absolute inset-0 grid place-items-center">
          <button
            type="button"
            data-testid="pg-file-preview-c-reopen"
            onClick={() => setOpen(true)}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            미리보기 열기
          </button>
        </div>
      )}

      {open && node && (
        <>
          <div className="absolute inset-0 bg-foreground/10 backdrop-blur-[1px] dark:bg-black/50" />
          <div className="absolute inset-x-10 inset-y-6 flex flex-col overflow-hidden rounded-xl border bg-background shadow-2xl animate-in zoom-in-95 fade-in duration-150">
            {/* 헤더 */}
            <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
              <div className="flex items-center rounded-md border">
                <button
                  type="button"
                  data-testid="pg-file-preview-c-prev"
                  onClick={prev}
                  title="이전"
                  className="rounded-l-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="min-w-12 border-x px-2 text-center text-xs text-muted-foreground tabular-nums">
                  {index + 1} / {files.length}
                </span>
                <button
                  type="button"
                  data-testid="pg-file-preview-c-next"
                  onClick={next}
                  title="다음"
                  className="rounded-r-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
              <div className="flex min-w-0 items-center gap-1.5 text-sm">
                <span className="hidden shrink-0 text-muted-foreground lg:inline">{pathOf(node)} /</span>
                <KindIcon kind={node.kind} />
                <span className="truncate font-medium text-foreground">{node.name}</span>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  data-testid="pg-file-preview-c-download"
                  onClick={() => setDownloaded(true)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Download className="size-3.5" />
                  {downloaded ? "다운로드 중" : "다운로드"}
                </button>
                <button
                  type="button"
                  data-testid="pg-file-preview-c-side"
                  onClick={() => setSide((v) => !v)}
                  title="패널"
                  className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {side ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
                </button>
                <button
                  type="button"
                  data-testid="pg-file-preview-c-close"
                  onClick={() => setOpen(false)}
                  title="닫기"
                  className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            </header>

            <div className="flex min-h-0 flex-1">
              {/* 미리보기 */}
              <div className="relative min-w-0 flex-1 bg-muted/40">
                <div className="absolute inset-0 overflow-auto p-8">
                  <div
                    className="flex min-h-full origin-top items-center justify-center transition-transform"
                    style={zoomable ? { transform: `scale(${ZOOMS[zoom] / 100})` } : undefined}
                  >
                    <PreviewBody key={node.id} node={node} />
                  </div>
                </div>
                {zoomable && (
                  <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border bg-background/90 p-1 shadow-lg backdrop-blur">
                    <button
                      type="button"
                      data-testid="pg-file-preview-c-zoom-out"
                      onClick={() => setZoom((z) => Math.max(0, z - 1))}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      data-testid="pg-file-preview-c-zoom-reset"
                      onClick={() => setZoom(2)}
                      className="w-12 rounded-full py-1 text-xs text-foreground tabular-nums hover:bg-muted"
                    >
                      {ZOOMS[zoom]}%
                    </button>
                    <button
                      type="button"
                      data-testid="pg-file-preview-c-zoom-in"
                      onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Plus className="size-3.5" />
                    </button>
                    <span className="mx-1 h-4 w-px bg-border" />
                    <button
                      type="button"
                      data-testid="pg-file-preview-c-fit"
                      title="맞춤"
                      onClick={() => setZoom(2)}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Maximize2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* 오른쪽 패널 */}
              {side && (
                <aside className="flex w-[340px] shrink-0 flex-col border-l bg-background">
                  <div className="border-b p-4">
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 place-items-center rounded-lg bg-muted">
                        <KindIcon kind={node.kind} className="size-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{node.name}</p>
                        <p className="text-xs text-muted-foreground">{KIND_META[node.kind].label}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-4 gap-1.5">
                      <Tile testid="info" icon={Info} label="정보" active={section === "info"} onClick={() => setSection("info")} />
                      <Tile
                        testid="versions"
                        icon={History}
                        label="버전 기록"
                        active={section === "versions"}
                        onClick={() => setSection("versions")}
                      />
                      <Tile testid="share" icon={Share2} label="공유" active={section === "share"} onClick={() => setSection("share")} />
                      <Tile
                        testid="delete"
                        icon={Trash2}
                        label={confirmDelete ? "확인" : "삭제"}
                        danger
                        active={confirmDelete}
                        onClick={() => {
                          if (confirmDelete) {
                            setDeleted((d) => [...d, node.id])
                            setConfirmDelete(false)
                          } else setConfirmDelete(true)
                        }}
                      />
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto p-4">
                    {section === "info" && <InfoPanel node={node} />}
                    {section === "versions" && <VersionsPanel key={node.id} node={node} slug={SLUG} />}
                    {section === "share" && <SharePanel key={node.id} node={node} slug={SLUG} />}
                  </div>
                </aside>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Tile({
  testid,
  icon: Icon,
  label,
  active,
  danger,
  onClick,
}: {
  testid: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  active?: boolean
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-testid={`pg-file-preview-c-${testid}`}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] transition-colors",
        danger
          ? active
            ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
            : "text-muted-foreground hover:border-rose-200 hover:text-rose-600 dark:hover:border-rose-900 dark:hover:text-rose-400"
          : active
            ? "border-foreground/20 bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  )
}
