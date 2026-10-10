"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Download, History, Info, Share2, Trash2, X } from "lucide-react"

import { cn } from "@/lib/utils"

import { formatBytes, relativeTime } from "../_mock"
import { InfoPanel, SharePanel, VersionsPanel } from "./panels"
import { FILES, FakeFileList, KindIcon, PreviewBody, Thumb, usePreviewNav } from "./shared"

type Panel = "info" | "share" | "versions" | null

const SLUG = "file-preview"

/** A: 어두운 전체 화면 라이트박스 + 하단 필름스트립 */
export function VariantA() {
  const [open, setOpen] = useState(true)
  const [deleted, setDeleted] = useState<string[]>([])
  const files = FILES.filter((f) => !deleted.includes(f.id))
  const { index, setIndex, prev, next } = usePreviewNav(files.length, () => setOpen(false), 3)
  const [panel, setPanel] = useState<Panel>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const node = files[Math.min(index, files.length - 1)]

  useEffect(() => {
    stripRef.current?.querySelector(`[data-active="true"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" })
  }, [index])

  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(null), 1800)
    return () => clearTimeout(id)
  }, [flash])

  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p))

  return (
    <div className="relative h-[calc(100dvh-3.5rem-3rem-3rem)] min-h-[560px] overflow-hidden rounded-xl border">
      <div className="absolute inset-0 overflow-hidden p-6">
        <FakeFileList />
      </div>

      {!open && (
        <div className="absolute inset-0 grid place-items-center bg-background/60">
          <button
            type="button"
            data-testid="pg-file-preview-a-reopen"
            onClick={() => setOpen(true)}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            미리보기 열기
          </button>
        </div>
      )}

      {open && node && (
        <div className="dark absolute inset-0 flex flex-col bg-background/95 text-foreground backdrop-blur-sm animate-in fade-in">
          {/* 상단 바 */}
          <header className="flex h-14 shrink-0 items-center gap-3 px-4">
            <button
              type="button"
              data-testid="pg-file-preview-a-close"
              onClick={() => setOpen(false)}
              title="닫기"
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
            <KindIcon kind={node.kind} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{node.name}</p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {formatBytes(node.size)}, {relativeTime(node.updatedAt)}
              </p>
            </div>
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
              {index + 1} / {files.length}
            </span>

            <div className="ml-auto flex items-center gap-1">
              {confirmDelete ? (
                <div className="flex items-center gap-1 rounded-lg bg-rose-950/60 py-1 pl-3 pr-1 ring-1 ring-rose-900">
                  <span className="mr-2 text-xs text-rose-200">휴지통으로 이동</span>
                  <button
                    type="button"
                    data-testid="pg-file-preview-a-delete-cancel"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    data-testid="pg-file-preview-a-delete-confirm"
                    onClick={() => {
                      setDeleted((d) => [...d, node.id])
                      setConfirmDelete(false)
                      setFlash(`'${node.name}' 삭제됨`)
                    }}
                    className="rounded-md bg-rose-600 px-2 py-1 text-xs font-medium text-[#fff] hover:bg-rose-500"
                  >
                    삭제
                  </button>
                </div>
              ) : (
                <>
                  <ToolButton testid="download" label="다운로드" onClick={() => setFlash("다운로드 시작")}>
                    <Download className="size-4" />
                  </ToolButton>
                  <ToolButton testid="share" label="공유" active={panel === "share"} onClick={() => toggle("share")}>
                    <Share2 className="size-4" />
                  </ToolButton>
                  <ToolButton testid="versions" label="버전 기록" active={panel === "versions"} onClick={() => toggle("versions")}>
                    <History className="size-4" />
                  </ToolButton>
                  <ToolButton testid="delete" label="삭제" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="size-4" />
                  </ToolButton>
                  <span className="mx-1 h-5 w-px bg-border" />
                  <ToolButton testid="info" label="정보" active={panel === "info"} onClick={() => toggle("info")}>
                    <Info className="size-4" />
                  </ToolButton>
                </>
              )}
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            {/* 본문 */}
            <div className="relative min-w-0 flex-1">
              <div className="absolute inset-0 overflow-auto px-20 py-6">
                <div className="flex min-h-full items-center justify-center">
                  <PreviewBody key={node.id} node={node} />
                </div>
              </div>
              <NavArrow side="left" onClick={prev} />
              <NavArrow side="right" onClick={next} />
              {flash && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-card px-3 py-1.5 text-xs text-foreground shadow-lg ring-1 ring-border animate-in fade-in slide-in-from-bottom-2">
                  {flash}
                </div>
              )}
            </div>

            {panel && (
              <aside className="flex w-80 shrink-0 flex-col border-l bg-card/60 animate-in slide-in-from-right-4 fade-in">
                <div className="flex h-11 items-center justify-between px-4">
                  <p className="text-sm font-medium">
                    {panel === "info" ? "정보" : panel === "share" ? "공유" : "버전 기록"}
                  </p>
                  <button
                    type="button"
                    data-testid="pg-file-preview-a-panel-close"
                    onClick={() => setPanel(null)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
                  {panel === "info" && <InfoPanel node={node} />}
                  {panel === "share" && <SharePanel key={node.id} node={node} slug={SLUG} />}
                  {panel === "versions" && <VersionsPanel key={node.id} node={node} slug={SLUG} />}
                </div>
              </aside>
            )}
          </div>

          {/* 필름스트립 */}
          <div ref={stripRef} className="flex h-20 shrink-0 items-center gap-2 overflow-x-auto border-t px-4">
            {files.map((f, i) => (
              <button
                key={f.id}
                type="button"
                data-testid={`pg-file-preview-a-strip-${f.id}`}
                data-active={i === index}
                onClick={() => setIndex(i)}
                title={f.name}
                className={cn(
                  "shrink-0 rounded-md p-0.5 transition",
                  i === index ? "ring-2 ring-foreground" : "opacity-50 hover:opacity-100",
                )}
              >
                <Thumb node={f} className="h-12 w-16" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ToolButton({
  testid,
  label,
  active,
  onClick,
  children,
}: {
  testid: string
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      data-testid={`pg-file-preview-a-${testid}`}
      onClick={onClick}
      title={label}
      className={cn(
        "rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function NavArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid={`pg-file-preview-a-${side === "left" ? "prev" : "next"}`}
      onClick={onClick}
      title={side === "left" ? "이전" : "다음"}
      className={cn(
        "absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-muted/70 text-foreground backdrop-blur transition hover:bg-muted",
        side === "left" ? "left-4" : "right-4",
      )}
    >
      {side === "left" ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
    </button>
  )
}
