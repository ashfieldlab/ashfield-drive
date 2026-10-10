"use client"

import { useState } from "react"
import { Check, ChevronDown, Copy, Download, Link2, Link2Off, Loader2, Lock, RefreshCw, Trash2, X } from "lucide-react"

import { api } from "@/lib/api-client"
import { useApiGet } from "@/lib/hooks/use-api"
import { cn } from "@/lib/utils"
import { logger } from "@/lib/utils/logger"
import { useToast } from "@/components/ui-custom/use-toast"
import { useConfirm } from "@/components/ui-custom/use-confirm"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { QrPattern, Switch, useCopied } from "@/components/files/share-parts"
import type { ExternalLinkList, ExternalLinkResponse, NodeResponse } from "@/lib/types/api"

const EXPIRY_OPTIONS: { days: number | null; label: string }[] = [
  { days: null, label: "없음" },
  { days: 1, label: "1일" },
  { days: 7, label: "7일" },
  { days: 30, label: "30일" },
  { days: 90, label: "90일" },
]

function urlFor(token: string): string {
  if (typeof window === "undefined") return `/s/${token}`
  return `${window.location.origin}/s/${token}`
}

const shortUrl = (url: string) => url.replace(/^https?:\/\//, "")

function expiryLabel(iso: string | null): string {
  if (!iso) return "없음"
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })
}

const isExpired = (iso: string | null) => !!iso && new Date(iso).getTime() < Date.now()

/**
 * 외부 링크 패널 (오른쪽). 백엔드는 링크 수정 API 가 없어서 만료와 비밀번호 변경은
 * "새 링크 발급 + 기존 링크 철회" 로 처리한다 (URL 이 바뀜). 비밀번호는 해시만 저장되므로
 * 비밀번호가 걸린 링크를 다시 만들 때는 비밀번호를 다시 받는다.
 * 권한은 항상 read: write 는 공개 페이지에서 쓰이지 않는다.
 */
export function ShareLinkPanel({ node, onClose }: { node: NodeResponse; onClose: () => void }) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const { copied, copy } = useCopied()
  const { data, isLoading, mutate } = useApiGet<ExternalLinkList>(
    `/api/v1/nodes/${node.id}/external-links`,
  )
  const [busy, setBusy] = useState(false)
  const [pwEditing, setPwEditing] = useState(false)
  const [pw, setPw] = useState("")
  // 비밀번호 재입력을 기다리는 만료 변경 (undefined = 변경 없음)
  const [pendingExpiry, setPendingExpiry] = useState<string | null | undefined>(undefined)

  // 목록은 created_at desc: 첫 번째가 최신
  const active = (data?.links ?? []).filter((l) => !l.revoked_at)
  const primary = active[0] ?? null
  const others = active.slice(1)

  function resetPw() {
    setPwEditing(false)
    setPw("")
    setPendingExpiry(undefined)
  }

  async function post(expiresAt: string | null, password: string | null) {
    return api<ExternalLinkResponse>(`/api/v1/nodes/${node.id}/external-links`, {
      method: "POST",
      body: { permission: "read", password, expires_at: expiresAt },
    })
  }

  async function del(link: ExternalLinkResponse) {
    await api(`/api/v1/nodes/${node.id}/external-links/${link.id}`, { method: "DELETE" })
  }

  async function run(fn: () => Promise<void>, failMsg: string) {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      logger.warn("external_link_action_failed", { category: "api", nodeId: node.id, error: String(e) })
      toast.error(`${failMsg}: ${(e as Error).message}`)
    } finally {
      setBusy(false)
      void mutate()
    }
  }

  function createLink() {
    void run(async () => {
      await post(null, null)
      toast.success("링크를 만들었습니다")
    }, "생성 실패")
  }

  /** 설정을 바꾼 새 링크 발급 후 기존 링크 철회 */
  function reissue(link: ExternalLinkResponse, expiresAt: string | null, password: string | null) {
    void run(async () => {
      await post(expiresAt, password)
      await del(link)
      resetPw()
      toast.success("새 링크로 바꿨습니다")
    }, "변경 실패")
  }

  async function turnOff() {
    if (active.length === 0) return
    const ok = await confirm({
      title: "외부 링크 끄기",
      description: "기존 URL 이 즉시 무효화됩니다.",
      confirmText: "끄기",
      variant: "destructive",
    })
    if (!ok) return
    void run(async () => {
      for (const l of active) await del(l)
      resetPw()
      toast.success("외부 링크를 껐습니다")
    }, "실패")
  }

  async function revokeOne(link: ExternalLinkResponse) {
    const ok = await confirm({
      title: "링크 철회",
      description: "이 URL 이 즉시 무효화됩니다.",
      confirmText: "철회",
      variant: "destructive",
    })
    if (!ok) return
    void run(async () => {
      await del(link)
      toast.success("철회했습니다")
    }, "실패")
  }

  async function regenerate(link: ExternalLinkResponse) {
    const ok = await confirm({
      title: "링크 재발급",
      description: "기존 URL 이 즉시 무효화됩니다.",
      confirmText: "재발급",
    })
    if (!ok) return
    if (link.has_password) {
      setPendingExpiry(link.expires_at)
      setPwEditing(true)
      return
    }
    reissue(link, link.expires_at, null)
  }

  function changeExpiry(link: ExternalLinkResponse, days: number | null) {
    const iso = days == null ? null : new Date(Date.now() + days * 86400000).toISOString()
    if (link.has_password) {
      setPendingExpiry(iso)
      setPwEditing(true)
      return
    }
    reissue(link, iso, null)
  }

  const shownExpiry = primary ? (pendingExpiry !== undefined ? pendingExpiry : primary.expires_at) : null

  return (
    <section className="flex shrink-0 flex-col border-t bg-muted/40 md:w-[272px] md:rounded-r-xl md:border-t-0 md:border-l">
      <header className="flex items-center gap-2 px-4 pt-4 pb-3">
        <Link2 size={16} className="text-muted-foreground" />
        <h3 className="flex-1 text-sm font-medium">외부 링크</h3>
        <Switch
          checked={active.length > 0}
          disabled={busy || isLoading}
          onChange={(v) => (v ? createLink() : void turnOff())}
          testId="share-link-toggle"
          label="외부 링크"
        />
        <button
          type="button"
          onClick={onClose}
          data-testid="share-modal-close"
          aria-label="닫기"
          className="-mr-1 ml-1 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <X size={16} />
        </button>
      </header>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-10 text-muted-foreground">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : primary ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4" data-testid="share-link-card">
          <div className="rounded-lg border bg-background p-3" data-testid={`link-row-${primary.id}`}>
            <div className={cn("mx-auto w-fit rounded-md p-1", isExpired(primary.expires_at) && "opacity-30")}>
              <QrPattern seed={primary.token} size={108} />
            </div>
            <div
              className="mt-2 truncate text-center font-mono text-[11px] text-muted-foreground"
              title={urlFor(primary.token)}
            >
              {shortUrl(urlFor(primary.token))}
            </div>
            <span className="sr-only" data-testid="link-url">
              {urlFor(primary.token)}
            </span>
            <button
              type="button"
              onClick={() => copy(urlFor(primary.token), primary.id)}
              data-testid="link-copy-button"
              className={cn(
                "mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors",
                copied === primary.id
                  ? "bg-emerald-600 text-white dark:bg-emerald-600"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {copied === primary.id ? <Check size={15} /> : <Copy size={14} />}
              {copied === primary.id ? "복사됨" : "링크 복사"}
            </button>
          </div>

          <div className="mt-3 divide-y rounded-lg border bg-background text-sm">
            <Row label="만료">
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={busy}
                    data-testid="link-expiry-trigger"
                    className={cn(
                      "-mr-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-foreground/80 hover:bg-muted disabled:opacity-50 data-[state=open]:bg-muted",
                      isExpired(shownExpiry) && "text-rose-600 dark:text-rose-400",
                    )}
                  >
                    {isExpired(shownExpiry) ? "만료됨" : expiryLabel(shownExpiry)}
                    <ChevronDown size={13} className="text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  {EXPIRY_OPTIONS.map((o) => (
                    <DropdownMenuItem
                      key={o.label}
                      onSelect={() => changeExpiry(primary, o.days)}
                      data-testid={`link-expiry-${o.days ?? "none"}`}
                      className="py-1.5"
                    >
                      <span className="flex-1">{o.label}</span>
                      {o.days == null && !shownExpiry && <Check />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </Row>
            <div>
              <Row label="비밀번호">
                <Switch
                  checked={primary.has_password || pwEditing}
                  disabled={busy}
                  onChange={(v) => {
                    if (v) setPwEditing(true)
                    else if (primary.has_password)
                      reissue(primary, pendingExpiry !== undefined ? pendingExpiry : primary.expires_at, null)
                    else resetPw()
                  }}
                  testId="link-password-toggle"
                  label="비밀번호"
                />
              </Row>
              {pwEditing && (
                <form
                  className="flex gap-1.5 px-3 pb-2.5"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (pw.length < 4 || busy) return
                    reissue(primary, pendingExpiry !== undefined ? pendingExpiry : primary.expires_at, pw)
                  }}
                >
                  <input
                    type="password"
                    value={pw}
                    autoFocus
                    onChange={(e) => setPw(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.stopPropagation()
                        resetPw()
                      }
                    }}
                    placeholder={primary.has_password ? "비밀번호 다시 입력" : "4자 이상"}
                    minLength={4}
                    data-testid="link-password-input"
                    className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
                  />
                  <button
                    type="submit"
                    disabled={pw.length < 4 || busy}
                    data-testid="link-password-save"
                    className="h-7 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    설정
                  </button>
                </form>
              )}
            </div>
          </div>

          {others.length > 0 && (
            <ul className="mt-3 space-y-1" data-testid="share-link-others">
              {others.map((l) => (
                <li
                  key={l.id}
                  data-testid={`link-row-${l.id}`}
                  className="flex items-center gap-1 rounded-md border bg-background py-1 pr-1 pl-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[11px] text-foreground/80" data-testid={`link-row-${l.id}-url`}>
                      /s/{l.token}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      {l.has_password && <Lock size={9} />}
                      {isExpired(l.expires_at) ? "만료됨" : l.expires_at ? `${expiryLabel(l.expires_at)} 만료` : "만료 없음"}
                      <span>, {l.access_count}회</span>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => copy(urlFor(l.token), l.id)}
                    data-testid={`link-row-${l.id}-copy`}
                    aria-label="복사"
                    className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {copied === l.id ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void revokeOne(l)}
                    disabled={busy}
                    data-testid={`link-row-${l.id}-revoke`}
                    aria-label="철회"
                    className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-rose-600 dark:hover:text-rose-400"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-auto flex items-center gap-2 pt-3 text-xs text-muted-foreground">
            <Download size={13} />
            <span className="flex-1" data-testid="link-download-count">
              다운로드 {primary.access_count}회
            </span>
            <button
              type="button"
              onClick={() => void regenerate(primary)}
              disabled={busy}
              data-testid="link-regenerate"
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 hover:bg-background hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw size={12} className={cn(busy && "animate-spin")} />
              재발급
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 md:pb-10">
          <span className="grid size-12 place-items-center rounded-full bg-background text-muted-foreground ring-1 ring-border">
            <Link2Off size={20} />
          </span>
          <span className="text-sm text-muted-foreground">링크 없음</span>
          <button
            type="button"
            onClick={createLink}
            disabled={busy}
            data-testid="link-create-button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            링크 만들기
          </button>
        </div>
      )}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-10 items-center justify-between px-3">
      <span className="text-[13px]">{label}</span>
      {children}
    </div>
  )
}
