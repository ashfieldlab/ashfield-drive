"use client"

import { useState } from "react"
import { ArrowRight, Check, Clock, Download, Eye, Loader2, Lock, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { formatBytes, LINK } from "../_mock"
import {
  Avatar,
  Brand,
  BrowserFrame,
  daysLeft,
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

/** A: 가운데 카드 하나 (WeTransfer 류) */
export function VariantA() {
  const [state, setState] = useState<PublicState>("password")
  return (
    <BrowserFrame state={state} onState={setState} className="bg-muted/40">
      <div
        className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-30"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, color-mix(in oklch, var(--foreground) 12%, transparent) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />
      <header className="relative flex items-center justify-between px-6 py-4">
        <Brand />
      </header>
      <div className="relative flex flex-1 items-center justify-center overflow-y-auto px-4 pb-16">
        <div className="w-[400px] max-w-full overflow-hidden rounded-2xl border bg-card shadow-xl shadow-black/5">
          {state === "password" && <PasswordCard onPass={() => setState("file")} />}
          {state === "file" && <FileCard />}
          {state === "folder" && <FolderCard />}
          {state === "expired" && <ExpiredCard />}
        </div>
      </div>
    </BrowserFrame>
  )
}

function SharedBy() {
  return (
    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
      <Avatar className="size-5 text-[10px]" />
      <span>
        <span className="font-medium text-foreground">{SHARER.name}</span> 님이 공유
      </span>
    </div>
  )
}

function ExpiryChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
      <Clock className="size-3" />
      {EXPIRES}까지 · {daysLeft()}일 남음
    </span>
  )
}

function PasswordCard({ onPass }: { onPass: () => void }) {
  const gate = usePasswordGate(onPass)
  return (
    <div className="px-8 pb-8 pt-10 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted">
        <Lock className="size-6 text-foreground/70" />
      </span>
      <h1 className="mt-5 text-lg font-semibold">비밀번호 필요</h1>
      <div className="mt-2">
        <SharedBy />
      </div>
      <form
        className="mt-6 space-y-2 text-left"
        onSubmit={(e) => {
          e.preventDefault()
          gate.submit()
        }}
      >
        <div
          className={cn(
            "flex h-10 items-center rounded-lg border bg-background pl-3 pr-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
            gate.error && "border-destructive focus-within:border-destructive focus-within:ring-destructive/20",
          )}
        >
          <input
            type="password"
            autoFocus
            value={gate.value}
            onChange={(e) => gate.setValue(e.target.value)}
            placeholder="비밀번호"
            aria-invalid={gate.error}
            data-testid="pg-public-link-a-password"
            className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="icon" disabled={!gate.value || gate.busy} data-testid="pg-public-link-a-password-submit" aria-label="열기">
            {gate.busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          </Button>
        </div>
        {gate.error && <p className="text-xs text-destructive">비밀번호가 올바르지 않습니다</p>}
      </form>
    </div>
  )
}

function DownloadButton({ label, testid }: { label: string; testid: string }) {
  const { progress, start } = useFakeDownload()
  const done = progress === 100
  return (
    <Button
      size="lg"
      className="relative h-11 w-full overflow-hidden text-sm"
      onClick={start}
      disabled={progress !== null}
      data-testid={testid}
    >
      {progress !== null && (
        <span className="absolute inset-y-0 left-0 bg-primary-foreground/15 transition-[width]" style={{ width: `${progress}%` }} />
      )}
      <span className="relative flex items-center gap-2">
        {done ? <Check /> : progress !== null ? <Loader2 className="animate-spin" /> : <Download />}
        {done ? "완료" : progress !== null ? `${Math.floor(progress)}%` : label}
      </span>
    </Button>
  )
}

function FileCard() {
  const [preview, setPreview] = useState(false)
  return (
    <>
      <div className="relative bg-muted/60 px-8 pb-6 pt-8">
        {preview ? (
          <div className="relative">
            <SlidePreview className="text-[11px]" />
            <button
              type="button"
              onClick={() => setPreview(false)}
              data-testid="pg-public-link-a-preview-close"
              aria-label="닫기"
              className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="relative">
              <KindIcon kind={FILE.kind} className="size-24 rounded-3xl shadow-sm ring-1 ring-black/5" iconClassName="size-10" />
              <span className="absolute -bottom-1.5 -right-2 rounded-md bg-foreground px-1.5 py-0.5 font-mono text-[10px] font-semibold text-background">
                PPTX
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="px-8 pb-8 pt-5 text-center">
        <h1 className="break-all text-base font-semibold">{FILE.name}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatBytes(FILE.size)} · {kindLabel(FILE.kind)}
        </p>
        <div className="mt-4 flex flex-col items-center gap-2">
          <SharedBy />
          <ExpiryChip />
        </div>
        <div className="mt-6 space-y-2">
          <DownloadButton label="다운로드" testid="pg-public-link-a-download" />
          {!preview && (
            <Button variant="ghost" className="h-9 w-full" onClick={() => setPreview(true)} data-testid="pg-public-link-a-preview">
              <Eye />
              미리보기
            </Button>
          )}
        </div>
      </div>
    </>
  )
}

function FolderCard() {
  return (
    <>
      <div className="flex items-center gap-4 border-b px-6 py-5">
        <KindIcon kind="folder" className="size-12 rounded-xl" iconClassName="size-6" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{FOLDER.name}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {FOLDER.count}개 · {formatBytes(FOLDER.size)}
          </p>
        </div>
      </div>
      <ul className="max-h-[260px] overflow-y-auto py-1">
        {PHOTOS.map((p) => (
          <li key={p.id} className="group flex items-center gap-3 px-6 py-1.5 hover:bg-muted/60">
            {p.thumb ? (
              <span className="size-8 shrink-0 rounded-md ring-1 ring-black/5" style={{ background: p.thumb }} />
            ) : (
              <KindIcon kind={p.kind} className="size-8 rounded-md" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
            <span className="text-xs tabular-nums text-muted-foreground group-hover:hidden">{formatBytes(p.size)}</span>
            <button
              type="button"
              data-testid={`pg-public-link-a-item-download-${p.id}`}
              aria-label="다운로드"
              className="hidden size-6 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground group-hover:grid"
            >
              <Download className="size-3.5" />
            </button>
          </li>
        ))}
        <li className="px-6 py-2 text-xs text-muted-foreground">+{(FOLDER.count ?? 0) - PHOTOS.length}개</li>
      </ul>
      <div className="space-y-3 border-t px-6 py-5">
        <div className="flex items-center justify-between">
          <SharedBy />
          <ExpiryChip />
        </div>
        <DownloadButton label={`모두 다운로드 · ZIP ${formatBytes(FOLDER.size)}`} testid="pg-public-link-a-download-all" />
      </div>
    </>
  )
}

function ExpiredCard() {
  return (
    <div className="px-8 py-12 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-50 dark:bg-amber-950/50">
        <Clock className="size-6 text-amber-600 dark:text-amber-300" />
      </span>
      <h1 className="mt-5 text-lg font-semibold">만료된 링크</h1>
      <p className="mt-1 text-sm text-muted-foreground">{EXPIRED_AT} 만료</p>
      <div className="mt-6 rounded-lg bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
        <SharedBy />
        <p className="mt-2 font-mono">{LINK.url.replace("https://", "")}</p>
      </div>
    </div>
  )
}
