"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowUpRight, Loader2 } from "lucide-react"

import { FilePreview, isPreviewable } from "@/components/files/file-preview"
import { useToast } from "@/components/ui-custom/use-toast"
import { api } from "@/lib/api-client"
import type { NodeResponse } from "@/lib/types/api"
import { cn } from "@/lib/utils"
import { DAY_BUCKETS, dayBucket } from "@/lib/utils/audit-format"
import { formatDateTime } from "@/lib/utils/format"
import { logger } from "@/lib/utils/logger"

import {
  ACTION_META,
  activityKind,
  activitySentence,
  actorLabel,
  hasTarget,
  targetKind,
} from "./activity-sentence"
import { KindIcon } from "./kind-icon"
import type { ActivityItem, ActivityNode } from "./types"
import { UserAvatar } from "./user-avatar"

export type ActivityScope = "all" | "me" | "others"

export const ACTIVITY_SCOPES: { key: ActivityScope; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "me", label: "내 활동" },
  { key: "others", label: "다른 사람" },
]

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric", weekday: "short" })
}

function folderHref(n: ActivityNode): string {
  return `/files?scope=${n.scope}&folder=${n.id}`
}

/** 대상이 들어 있는 폴더. 내가 볼 수 없는 폴더면 공유받음 목록 */
function locationHref(n: ActivityNode): string {
  if (n.parent_id === null) return `/files?scope=${n.scope}`
  if (n.parent_name === null) return "/files?view=shared-with-me"
  return `/files?scope=${n.scope}&folder=${n.parent_id}`
}

export function ActivityTimeline({
  items,
  meSub,
  scope,
}: {
  items: ActivityItem[]
  meSub: string | null
  scope: ActivityScope
}) {
  const [active, setActive] = useState<string | null>(null)

  const groups = useMemo(() => {
    const now = new Date()
    const filtered = items.filter((a) =>
      scope === "all" ? true : scope === "me" ? a.actor_sub === meSub : a.actor_sub !== meSub,
    )
    return DAY_BUCKETS.map((b) => ({
      label: b,
      items: filtered.filter((a) => dayBucket(a.created_at, now) === b),
    })).filter((g) => g.items.length > 0)
  }, [items, meSub, scope])

  if (groups.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-input p-10 text-center text-sm text-muted-foreground"
        data-testid="activity-empty"
      >
        활동 없음
      </div>
    )
  }

  return (
    <div className="space-y-10" data-testid="activity-list">
      {groups.map((g) => (
        <section key={g.label} data-testid={`activity-group-${g.label}`}>
          <div className="mb-3 flex items-baseline gap-2">
            <h2 className="text-sm font-semibold">{g.label}</h2>
            <span className="text-xs tabular-nums text-muted-foreground">{g.items.length}</span>
          </div>
          <ol className="relative">
            {g.items.map((a, i) => (
              <ActivityRow
                key={a.id}
                item={a}
                last={i === g.items.length - 1}
                showClock={g.label === "오늘" || g.label === "어제"}
                open={active === a.id}
                onToggle={() => setActive(active === a.id ? null : a.id)}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

function ActivityRow({
  item: a,
  last,
  showClock,
  open,
  onToggle,
}: {
  item: ActivityItem
  last: boolean
  showClock: boolean
  open: boolean
  onToggle: () => void
}) {
  const { toast } = useToast()
  const router = useRouter()
  const meta = ACTION_META[activityKind(a)]
  const ActionIcon = meta.icon
  const actor = actorLabel(a)
  const kind = targetKind(a)
  const node = a.node ?? null
  const available = !!node && !node.deleted
  const vault = a.meta.vault === true
  const [preview, setPreview] = useState<NodeResponse | null>(null)
  const [opening, setOpening] = useState(false)

  async function openFile(n: ActivityNode) {
    setOpening(true)
    try {
      const full = await api<NodeResponse>(`/api/v1/nodes/${n.id}`)
      if (isPreviewable(full)) {
        setPreview(full)
      } else {
        router.push(locationHref(n))
      }
    } catch (err) {
      logger.warn("activity_open_failed", { category: "ui", id: n.id, error: String(err) })
      toast.error("열 수 없습니다")
    } finally {
      setOpening(false)
    }
  }

  const btnPrimary =
    "inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 aria-disabled:pointer-events-none aria-disabled:opacity-50 disabled:pointer-events-none disabled:opacity-50"
  const btnSecondary =
    "inline-flex items-center rounded-md border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-50"

  const previewProps = preview
    ? { node: preview, vaultRootId: null, onClose: () => setPreview(null) }
    : null

  return (
    <li className="relative flex gap-4 pb-1" data-testid={`activity-row-${a.id}`}>
      {!last && <span className="absolute top-11 bottom-0 left-[17px] w-px bg-border" />}
      <div className="relative mt-1.5 shrink-0 self-start">
        <UserAvatar name={actor} seed={a.actor_sub ?? "system"} image={a.actor_image} size={36} />
        <span
          className={cn(
            "absolute -right-1.5 -bottom-1.5 inline-flex size-5 items-center justify-center rounded-full ring-2 ring-background",
            meta.tone,
          )}
        >
          <ActionIcon className="size-2.5" />
        </span>
      </div>
      <div
        className={cn(
          "-mx-2 mb-2 min-w-0 flex-1 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50",
          open && "bg-muted/60 hover:bg-muted/60",
        )}
      >
        <button
          type="button"
          data-testid={`activity-row-${a.id}-toggle`}
          onClick={onToggle}
          aria-expanded={open}
          className="flex w-full items-start gap-3 text-left"
        >
          <p className="min-w-0 flex-1 text-sm leading-6 text-muted-foreground">
            {activitySentence(a, {
              actor: (name) => <span className="font-medium text-foreground">{name}</span>,
              em: (s) => <span className="font-medium text-foreground">{s}</span>,
              target: (name) => (
                <span
                  className={cn(
                    "mr-px ml-0.5 inline-flex max-w-full translate-y-[3px] items-center gap-1.5 rounded-md border bg-card py-0.5 pr-2 pl-1 align-baseline text-[13px] leading-4 font-medium text-foreground",
                    (!available || vault) && "text-muted-foreground",
                    node?.deleted && "line-through decoration-muted-foreground/60",
                  )}
                >
                  <KindIcon kind={kind} className="size-5 [&_svg]:size-3" iconClassName="size-3" />
                  <span className="truncate">{name}</span>
                </span>
              ),
            })}
          </p>
          <time
            dateTime={a.created_at}
            title={formatDateTime(a.created_at)}
            className="shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground"
          >
            {showClock ? clock(a.created_at) : dateLabel(a.created_at)}
          </time>
        </button>
        {open && hasTarget(a) && (
          <div className="mt-3 flex items-center gap-2">
            {available && node.kind === "folder" ? (
              <Link href={folderHref(node)} data-testid={`activity-row-${a.id}-open`} className={btnPrimary}>
                열기
                <ArrowUpRight className="size-3" />
              </Link>
            ) : (
              <button
                type="button"
                data-testid={`activity-row-${a.id}-open`}
                disabled={!available || vault || opening}
                onClick={() => node && void openFile(node)}
                className={btnPrimary}
              >
                {opening ? <Loader2 className="size-3 animate-spin" /> : null}
                열기
                {!opening && <ArrowUpRight className="size-3" />}
              </button>
            )}
            {available ? (
              <Link href={locationHref(node)} data-testid={`activity-row-${a.id}-locate`} className={btnSecondary}>
                위치 보기
              </Link>
            ) : (
              <button
                type="button"
                disabled
                data-testid={`activity-row-${a.id}-locate`}
                className={cn(btnSecondary, "disabled:pointer-events-none disabled:opacity-50")}
              >
                위치 보기
              </button>
            )}
            {node?.deleted && <span className="text-xs text-muted-foreground">휴지통</span>}
            {!node && a.entity_type === "node" && <span className="text-xs text-muted-foreground">삭제됨</span>}
          </div>
        )}
      </div>
      {previewProps && <FilePreview {...previewProps} />}
    </li>
  )
}
