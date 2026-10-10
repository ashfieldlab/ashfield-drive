"use client"

import { useState } from "react"
import { Check, Clock, Mail, Download, Eye, Loader2, Lock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { formatBytes } from "../_mock"
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

/** C: 왼쪽 브랜드 패널 + 오른쪽 내용 */
export function VariantC() {
  const [state, setState] = useState<PublicState>("folder")
  return (
    <BrowserFrame state={state} onState={setState} className="flex-row">
      <SidePanel state={state} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {state === "password" && <PasswordPane onPass={() => setState("file")} />}
        {state === "file" && <FilePane />}
        {state === "folder" && <FolderPane />}
        {state === "expired" && <ExpiredPane />}
      </main>
    </BrowserFrame>
  )
}

function SidePanel({ state }: { state: PublicState }) {
  const expired = state === "expired"
  const rows: [string, React.ReactNode][] = [
    ["공유", (
      <span key="s" className="flex items-center gap-2">
        <Avatar className="size-5 text-[10px] ring-2 ring-primary-foreground/20" />
        {SHARER.name}
      </span>
    )],
    ["만료", expired ? EXPIRED_AT : `${EXPIRES}, ${daysLeft()}일 남음`],
  ]
  return (
    <aside className="relative hidden w-[300px] shrink-0 flex-col overflow-hidden bg-primary p-7 text-primary-foreground md:flex">
      {/* 은은한 배경 무늬 */}
      <div
        className="pointer-events-none absolute -bottom-24 -right-24 size-80 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, currentColor 0%, transparent 65%)" }}
      />
      <div className="pointer-events-none absolute -left-16 top-1/3 size-56 rounded-full border border-current opacity-10" />
      <Brand className="relative [&_img]:ring-1 [&_img]:ring-primary-foreground/20" />
      <div className="relative mt-auto">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] opacity-60">공유 링크</p>
        <p className="mt-2 text-2xl font-semibold leading-snug">
          {state === "folder" ? FOLDER.name : state === "file" ? FILE.name : state === "expired" ? "만료됨" : "보호된 항목"}
        </p>
        <dl className="mt-8 space-y-3 border-t border-primary-foreground/15 pt-5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <dt className="opacity-60">{k}</dt>
              <dd className={cn("text-right font-medium", k === "만료" && expired && "line-through opacity-70")}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  )
}

function PaneHeader({ children }: { children: React.ReactNode }) {
  return <div className="flex h-16 shrink-0 items-center justify-between gap-4 border-b px-8">{children}</div>
}

function DownloadBtn({ label, testid, size = "lg" }: { label: string; testid: string; size?: "lg" | "default" }) {
  const { progress, start } = useFakeDownload()
  return (
    <Button size={size} onClick={start} disabled={progress !== null} data-testid={testid} className="min-w-32 tabular-nums">
      {progress === 100 ? <Check /> : progress !== null ? <Loader2 className="animate-spin" /> : <Download />}
      {progress === 100 ? "완료" : progress !== null ? `${Math.floor(progress)}%` : label}
    </Button>
  )
}

function PasswordPane({ onPass }: { onPass: () => void }) {
  const gate = usePasswordGate(onPass)
  return (
    <div className="flex flex-1 items-center justify-center px-8">
      <form
        className="w-full max-w-xs"
        onSubmit={(e) => {
          e.preventDefault()
          gate.submit()
        }}
      >
        <Lock className="size-5 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">비밀번호 입력</h1>
        <label className="mt-8 block text-xs font-medium text-muted-foreground" htmlFor="pg-pl-c-pw">
          비밀번호
        </label>
        <input
          id="pg-pl-c-pw"
          type="password"
          autoFocus
          value={gate.value}
          onChange={(e) => gate.setValue(e.target.value)}
          aria-invalid={gate.error}
          data-testid="pg-public-link-c-password"
          className={cn(
            "mt-1.5 h-10 w-full border-b-2 border-input bg-transparent text-base tracking-widest outline-none transition-colors focus:border-primary",
            gate.error && "border-destructive focus:border-destructive",
          )}
        />
        <p className={cn("mt-1.5 h-4 text-xs text-destructive", !gate.error && "invisible")}>비밀번호가 올바르지 않습니다</p>
        <Button type="submit" size="lg" className="mt-6 w-full" disabled={!gate.value || gate.busy} data-testid="pg-public-link-c-password-submit">
          {gate.busy && <Loader2 className="animate-spin" />}
          확인
        </Button>
      </form>
    </div>
  )
}

function FilePane() {
  const [preview, setPreview] = useState(true)
  return (
    <>
      <PaneHeader>
        <div className="flex min-w-0 items-center gap-3">
          <KindIcon kind={FILE.kind} className="size-9" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{FILE.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(FILE.size)}, {kindLabel(FILE.kind)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="lg" onClick={() => setPreview((v) => !v)} data-testid="pg-public-link-c-preview" aria-pressed={preview}>
            <Eye />
            미리보기
          </Button>
          <DownloadBtn label="다운로드" testid="pg-public-link-c-download" />
        </div>
      </PaneHeader>
      <div className="flex flex-1 items-center justify-center bg-muted/40 p-10">
        {preview ? (
          <SlidePreview className="w-full max-w-2xl text-[18px] shadow-xl" />
        ) : (
          <KindIcon kind={FILE.kind} className="size-32 rounded-[2rem]" iconClassName="size-14" />
        )}
      </div>
    </>
  )
}

function FolderPane() {
  return (
    <>
      <PaneHeader>
        <div className="flex min-w-0 items-center gap-3">
          <KindIcon kind="folder" className="size-9" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{FOLDER.name}</p>
            <p className="text-xs text-muted-foreground">
              {FOLDER.count}개, {formatBytes(FOLDER.size)}
            </p>
          </div>
        </div>
        <DownloadBtn label="모두 다운로드" testid="pg-public-link-c-download-all" />
      </PaneHeader>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background/95 text-left text-xs text-muted-foreground backdrop-blur">
            <tr className="border-b">
              <th className="py-2 pl-8 font-medium">이름</th>
              <th className="w-28 py-2 font-medium">종류</th>
              <th className="w-24 py-2 pr-4 text-right font-medium">크기</th>
              <th className="w-14 pr-6" />
            </tr>
          </thead>
          <tbody>
            {PHOTOS.map((p) => (
              <tr key={p.id} className="group border-b border-border/60 hover:bg-muted/50">
                <td className="py-2 pl-8">
                  <div className="flex items-center gap-3">
                    {p.thumb ? (
                      <span className="size-8 shrink-0 rounded-md ring-1 ring-black/5" style={{ background: p.thumb }} />
                    ) : (
                      <KindIcon kind={p.kind} className="size-8 rounded-md" />
                    )}
                    <span className="truncate">{p.name}</span>
                  </div>
                </td>
                <td className="text-xs text-muted-foreground">{kindLabel(p.kind)}</td>
                <td className="pr-4 text-right text-xs tabular-nums text-muted-foreground">{formatBytes(p.size)}</td>
                <td className="pr-6 text-right">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="opacity-0 group-hover:opacity-100"
                    data-testid={`pg-public-link-c-item-download-${p.id}`}
                    aria-label="다운로드"
                  >
                    <Download />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-8 py-3 text-xs text-muted-foreground">+{(FOLDER.count ?? 0) - PHOTOS.length}개</p>
      </div>
    </>
  )
}

function ExpiredPane() {
  return (
    <div className="flex flex-1 items-center justify-center px-8">
      <div className="w-full max-w-xs">
        <Clock className="size-5 text-amber-600 dark:text-amber-300" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">만료된 링크</h1>
        <p className="mt-2 text-sm text-muted-foreground">링크가 만료되었습니다. 공유한 사람에게 문의하세요.</p>
        <a
          href={`mailto:${SHARER.email}`}
          data-testid="pg-public-link-c-expired-contact"
          className="group mt-8 flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/50"
        >
          <Avatar className="size-8 text-xs" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">{SHARER.name}</p>
            <p className="truncate text-xs text-muted-foreground">{SHARER.email}</p>
          </div>
          <Mail className="size-4 text-muted-foreground group-hover:text-foreground" />
        </a>
      </div>
    </div>
  )
}
