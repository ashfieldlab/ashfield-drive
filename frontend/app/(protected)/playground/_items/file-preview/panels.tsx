"use client"

import { useState } from "react"
import { Check, Copy, Globe, Lock, RotateCcw, Star } from "lucide-react"

import { cn } from "@/lib/utils"

import { LINK, SHARES, VERSIONS, formatBytes, memberOf, relativeTime, type MockNode } from "../_mock"
import { Avatar, KIND_META, extOf, pathOf } from "./shared"

const PERM: Record<string, string> = { read: "보기", write: "편집", manage: "관리" }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-foreground">{children}</span>
    </div>
  )
}

export function InfoPanel({ node }: { node: MockNode }) {
  const owner = memberOf(node.owner)
  return (
    <div className="divide-y">
      <Row label="종류">
        {KIND_META[node.kind].label}
        {extOf(node.name) && extOf(node.name) !== KIND_META[node.kind].label && <span className="text-muted-foreground"> ({extOf(node.name)})</span>}
      </Row>
      <Row label="크기">
        <span className="tabular-nums">{formatBytes(node.size)}</span>
      </Row>
      <Row label="위치">{pathOf(node)}</Row>
      <Row label="소유자">
        <span className="inline-flex items-center gap-1.5">
          <Avatar id={owner.id} size="size-5" />
          {owner.name}
        </span>
      </Row>
      <Row label="수정">{relativeTime(node.updatedAt)}</Row>
      <Row label="공유">
        {node.sharedWith > 0 ? `${node.sharedWith}명` : "비공개"}
        {node.hasLink && <span className="text-muted-foreground">, 링크</span>}
      </Row>
      {node.starred && (
        <Row label="즐겨찾기">
          <Star className="inline size-3.5 fill-amber-400 text-amber-400" />
        </Row>
      )}
    </div>
  )
}

export function VersionsPanel({ node, slug }: { node: MockNode; slug: string }) {
  const [restored, setRestored] = useState<string | null>(null)
  const ratio = node.size / VERSIONS[0].size
  return (
    <ol className="space-y-1">
      {VERSIONS.map((v, i) => (
        <li key={v.id} className="group flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60">
          <div className="relative flex flex-col items-center self-stretch">
            <span
              className={cn(
                "mt-1.5 size-2 rounded-full",
                v.current ? "bg-primary" : "bg-muted-foreground/40",
              )}
            />
            {i < VERSIONS.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground">
              버전 {VERSIONS.length - i}
              {v.current && (
                <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">현재</span>
              )}
              {restored === v.id && (
                <span className="ml-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">복원됨</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {v.savedBy.name}, {relativeTime(v.savedAt)}, <span className="tabular-nums">{formatBytes(Math.round(v.size * ratio))}</span>
            </p>
          </div>
          {!v.current && (
            <button
              type="button"
              data-testid={`pg-${slug}-version-restore-${v.id}`}
              onClick={() => setRestored(v.id)}
              title="복원"
              className="rounded p-1.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="size-3.5" />
            </button>
          )}
        </li>
      ))}
    </ol>
  )
}

export function SharePanel({ node, slug }: { node: MockNode; slug: string }) {
  const [copied, setCopied] = useState(false)
  const [linkOn, setLinkOn] = useState(!!node.hasLink)
  const people = SHARES.slice(0, Math.max(0, Math.min(3, node.sharedWith)))
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">사용자</p>
        <ul className="space-y-1">
          <li className="flex items-center gap-2.5 py-1">
            <Avatar id={node.owner} />
            <span className="flex-1 truncate text-sm text-foreground">{memberOf(node.owner).name}</span>
            <span className="text-xs text-muted-foreground">소유자</span>
          </li>
          {people.map((s) => (
            <li key={s.member.id} className="flex items-center gap-2.5 py-1">
              <Avatar id={s.member.id} />
              <span className="flex-1 truncate text-sm text-foreground">{s.member.name}</span>
              <span className="text-xs text-muted-foreground">{PERM[s.permission]}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-lg border p-3">
        <div className="flex items-center gap-2">
          {linkOn ? (
            <Globe className="size-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Lock className="size-4 text-muted-foreground" />
          )}
          <span className="flex-1 text-sm text-foreground">{linkOn ? "링크 공유 중" : "링크 없음"}</span>
          <button
            type="button"
            role="switch"
            aria-checked={linkOn}
            data-testid={`pg-${slug}-link-toggle`}
            onClick={() => setLinkOn((v) => !v)}
            className={cn(
              "relative h-5 w-9 rounded-full transition-colors",
              linkOn ? "bg-primary" : "bg-muted-foreground/30",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-4 rounded-full bg-background shadow transition-all",
                linkOn ? "left-[18px]" : "left-0.5",
              )}
            />
          </button>
        </div>
        {linkOn && (
          <div className="mt-3 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
              {LINK.url}
            </span>
            <button
              type="button"
              data-testid={`pg-${slug}-link-copy`}
              onClick={() => setCopied(true)}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs text-foreground hover:bg-muted"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "복사됨" : "복사"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
