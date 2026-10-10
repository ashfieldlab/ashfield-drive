"use client"

import { useState } from "react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  LayoutGrid,
  List,
  Loader2,
  Lock,
  Minus,
  Plus,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { formatBytes } from "../_mock"
import {
  Avatar,
  Brand,
  BrowserFrame,
  EXPIRED_AT,
  EXPIRES,
  FILE,
  FOLDER,
  KindIcon,
  kindLabel,
  PHOTOS,
  SHARER,
  SlidePreview,
  useFakeDownload,
  usePasswordGate,
  type PublicState,
} from "./shared"

/** B: 전체 화면 뷰어 + 상단 바 */
export function VariantB() {
  const [state, setState] = useState<PublicState>("file")
  return (
    <BrowserFrame state={state} onState={setState}>
      {state === "password" && <PasswordView onPass={() => setState("file")} />}
      {state === "file" && <FileView />}
      {state === "folder" && <FolderView />}
      {state === "expired" && <ExpiredView />}
    </BrowserFrame>
  )
}

function TopBar({ title, meta, children }: { title?: React.ReactNode; meta?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4">
      <Brand />
      {title && (
        <>
          <span className="h-5 w-px bg-border" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{title}</p>
            {meta && <p className="truncate text-[11px] text-muted-foreground">{meta}</p>}
          </div>
        </>
      )}
      {!title && <div className="flex-1" />}
      {children}
    </header>
  )
}

function Sharer() {
  return (
    <span className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
      <Avatar className="size-5 text-[10px]" />
      {SHARER.name}
      <span className="text-border">|</span>
      <Clock className="size-3" />
      {EXPIRES}까지
    </span>
  )
}

function DownloadAction({ label, testid, variant = "default" }: { label: string; testid: string; variant?: "default" | "outline" }) {
  const { progress, start } = useFakeDownload()
  return (
    <Button variant={variant} onClick={start} disabled={progress !== null} data-testid={testid} className="min-w-28 tabular-nums">
      {progress === 100 ? <Check /> : progress !== null ? <Loader2 className="animate-spin" /> : <Download />}
      {progress === 100 ? "완료" : progress !== null ? `${Math.floor(progress)}%` : label}
    </Button>
  )
}

function PasswordView({ onPass }: { onPass: () => void }) {
  const gate = usePasswordGate(onPass)
  return (
    <>
      <TopBar>
        <Sharer />
      </TopBar>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-muted/50">
        {/* 잠긴 뒤쪽 미리보기 */}
        <div className="absolute inset-0 flex items-center justify-center p-16 opacity-50 blur-xl">
          <SlidePreview className="w-full max-w-3xl text-[22px]" />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            gate.submit()
          }}
          className="relative w-[340px] rounded-xl border bg-background/90 p-5 shadow-lg backdrop-blur"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <Lock className="size-4 text-muted-foreground" />
            비밀번호
          </div>
          <input
            type="password"
            autoFocus
            value={gate.value}
            onChange={(e) => gate.setValue(e.target.value)}
            aria-invalid={gate.error}
            data-testid="pg-public-link-b-password"
            className={cn(
              "mt-3 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30",
              gate.error && "border-destructive focus:border-destructive focus:ring-destructive/20",
            )}
          />
          {gate.error && <p className="mt-1.5 text-xs text-destructive">비밀번호가 올바르지 않습니다</p>}
          <Button type="submit" className="mt-3 w-full" disabled={!gate.value || gate.busy} data-testid="pg-public-link-b-password-submit">
            {gate.busy && <Loader2 className="animate-spin" />}
            열기
          </Button>
        </form>
      </div>
    </>
  )
}

function FileView() {
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(100)
  return (
    <>
      <TopBar
        title={
          <span className="flex items-center gap-2">
            <KindIcon kind={FILE.kind} className="size-5 rounded" iconClassName="size-3" />
            {FILE.name}
          </span>
        }
        meta={`${formatBytes(FILE.size)} · ${kindLabel(FILE.kind)}`}
      >
        <Sharer />
        <DownloadAction label="다운로드" testid="pg-public-link-b-download" />
      </TopBar>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-40 shrink-0 space-y-3 overflow-y-auto border-r bg-muted/30 p-3 md:block">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              data-testid={`pg-public-link-b-thumb-${n}`}
              className={cn("block w-full rounded-lg p-1 text-left ring-2 transition", page === n ? "ring-primary" : "ring-transparent hover:ring-border")}
            >
              <SlidePreview page={n} className="text-[5px]" />
              <span className="mt-1 block text-center text-[10px] text-muted-foreground">{n}</span>
            </button>
          ))}
        </aside>
        <div className="relative flex flex-1 flex-col bg-muted/50">
          <div className="flex flex-1 items-center justify-center overflow-auto p-10">
            <SlidePreview page={page} className="w-full shadow-xl transition-[max-width]" key={page} style={{ maxWidth: (768 * zoom) / 100 }} />
          </div>
          <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-background/95 p-1 text-xs shadow-md backdrop-blur">
            <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={() => setPage((p) => Math.max(1, p - 1))} data-testid="pg-public-link-b-prev" aria-label="이전">
              <ChevronLeft />
            </Button>
            <span className="w-14 text-center tabular-nums">{page} / 24</span>
            <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={() => setPage((p) => Math.min(24, p + 1))} data-testid="pg-public-link-b-next" aria-label="다음">
              <ChevronRight />
            </Button>
            <span className="mx-1 h-4 w-px bg-border" />
            <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={() => setZoom((z) => Math.max(50, z - 25))} data-testid="pg-public-link-b-zoom-out" aria-label="축소">
              <Minus />
            </Button>
            <span className="w-10 text-center tabular-nums">{zoom}%</span>
            <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={() => setZoom((z) => Math.min(200, z + 25))} data-testid="pg-public-link-b-zoom-in" aria-label="확대">
              <Plus />
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

function FolderView() {
  const [view, setView] = useState<"grid" | "list">("grid")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const selSize = PHOTOS.filter((p) => selected.has(p.id)).reduce((a, p) => a + p.size, 0)

  return (
    <>
      <TopBar
        title={
          <span className="flex items-center gap-2">
            <KindIcon kind="folder" className="size-5 rounded" iconClassName="size-3" />
            {FOLDER.name}
          </span>
        }
        meta={`${FOLDER.count}개 · ${formatBytes(FOLDER.size)}`}
      >
        <Sharer />
        {selected.size > 0 && (
          <DownloadAction variant="outline" label={`${selected.size}개 · ${formatBytes(selSize)}`} testid="pg-public-link-b-download-selected" />
        )}
        <DownloadAction label="모두 다운로드" testid="pg-public-link-b-download-all" />
      </TopBar>
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {selected.size > 0 ? (
            <>
              <span className="font-medium text-foreground">{selected.size}개 선택</span>
              <button type="button" onClick={() => setSelected(new Set())} data-testid="pg-public-link-b-clear" className="hover:text-foreground">
                해제
              </button>
            </>
          ) : (
            <span>{FOLDER.count}개</span>
          )}
        </div>
        <div className="flex rounded-md p-0.5 ring-1 ring-border">
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              data-testid={`pg-public-link-b-view-${v}`}
              aria-label={v === "grid" ? "격자" : "목록"}
              className={cn("grid size-6 place-items-center rounded", view === v ? "bg-muted text-foreground" : "text-muted-foreground")}
            >
              {v === "grid" ? <LayoutGrid className="size-3.5" /> : <List className="size-3.5" />}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {view === "grid" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {PHOTOS.map((p) => {
              const on = selected.has(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  data-testid={`pg-public-link-b-item-${p.id}`}
                  className={cn("group text-left", on && "[&_.tile]:ring-2 [&_.tile]:ring-primary")}
                >
                  <div className="tile relative aspect-[4/3] overflow-hidden rounded-lg bg-muted ring-1 ring-border transition">
                    {p.thumb ? (
                      <div className="absolute inset-0 transition group-hover:scale-[1.03]" style={{ background: p.thumb }} />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center">
                        <KindIcon kind={p.kind} className="size-12 rounded-xl" iconClassName="size-6" />
                      </div>
                    )}
                    <span
                      className={cn(
                        "absolute left-2 top-2 grid size-5 place-items-center rounded-full border-2 transition",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-white/80 bg-black/10 opacity-0 group-hover:opacity-100",
                      )}
                    >
                      {on && <Check className="size-3" />}
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-xs font-medium">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">{formatBytes(p.size)}</p>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="divide-y rounded-lg border">
            {PHOTOS.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  data-testid={`pg-public-link-b-check-${p.id}`}
                  className="size-3.5 accent-primary"
                />
                {p.thumb ? <span className="size-7 rounded" style={{ background: p.thumb }} /> : <KindIcon kind={p.kind} className="size-7 rounded" />}
                <span className="flex-1 truncate text-sm">{p.name}</span>
                <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">{formatBytes(p.size)}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function ExpiredView() {
  return (
    <>
      <TopBar />
      <div className="flex flex-1 flex-col items-center justify-center bg-muted/40 text-center">
        <div className="relative">
          <div className="h-28 w-44 rotate-[-4deg] rounded-lg border bg-background opacity-60 shadow-sm" />
          <div className="absolute inset-0 grid rotate-[3deg] place-items-center rounded-lg border bg-background shadow-md">
            <Clock className="size-8 text-muted-foreground" />
          </div>
        </div>
        <h1 className="mt-8 text-xl font-semibold">링크가 만료되었습니다</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {EXPIRED_AT} · {SHARER.name}
        </p>
      </div>
    </>
  )
}
