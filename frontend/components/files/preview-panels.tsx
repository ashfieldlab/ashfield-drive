"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, Globe, Loader2, Lock, RotateCcw, Share2 } from "lucide-react"

import { useAppContext } from "@/components/providers/app-context"
import { useToast } from "@/components/ui-custom/use-toast"
import { api } from "@/lib/api-client"
import * as e2e from "@/lib/e2e/session"
import { invalidateApi, useApiGet } from "@/lib/hooks/use-api"
import type {
  AncestorsResponse,
  ExternalLinkList,
  FileShareList,
  FileVersionResponse,
  NodeResponse,
} from "@/lib/types/api"
import { cn } from "@/lib/utils"
import { formatBytes } from "@/lib/utils/format"

import { Avatar, KIND_META, downloadSource, extOf, relativeTime, type FileKind } from "./preview-common"

const PERM: Record<string, string> = { read: "보기", write: "편집", manage: "관리" }
const T = "file-preview"

interface WorkspaceMembersResponse {
  members: { sub: string; email: string; name: string | null }[]
}

/** 소유자 표시 이름: 나, 아니면 워크스페이스 멤버 목록에서 */
function useOwnerName(ownerId: string): string {
  const { authUser } = useAppContext()
  const mine = authUser?.id === ownerId
  const { data } = useApiGet<WorkspaceMembersResponse>(mine ? null : "/api/v1/me/workspace/members?limit=50")
  if (mine) return `${authUser?.name || authUser?.email || ""} (나)`
  const m = data?.members.find((x) => x.sub === ownerId)
  return m ? m.name || m.email : "다른 사용자"
}

/** 공유 요약에 필요한 목록. 외부 링크는 관리 권한이 있을 때만 받는다 (없으면 403) */
export function useShareSummary(node: NodeResponse) {
  const { authUser, isSystemAdmin } = useAppContext()
  const canManage = isSystemAdmin || node.owner_id === authUser?.id
  const shares = useApiGet<FileShareList>(`/api/v1/nodes/${node.id}/shares`)
  const links = useApiGet<ExternalLinkList>(canManage ? `/api/v1/nodes/${node.id}/external-links` : null)
  const activeLinks = (links.data?.links ?? []).filter(
    (l) => !l.revoked_at && (!l.expires_at || new Date(l.expires_at).getTime() > Date.now()),
  )
  return {
    shares: shares.data?.shares ?? [],
    loading: shares.isLoading,
    linkCount: activeLinks.length,
    linksKnown: canManage && !!links.data,
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right break-words text-foreground">{children}</span>
    </div>
  )
}

/** 위치: 부모 폴더까지의 경로. 보안 폴더 안 폴더 이름은 복호화 */
function useLocation(node: NodeResponse, vaultRootId: string | null): string {
  const { data } = useApiGet<AncestorsResponse>(node.parent_id ? `/api/v1/nodes/${node.parent_id}/ancestors` : null)
  const [dec, setDec] = useState<Record<string, string>>({})
  const chain = useMemo(() => data?.ancestors ?? [], [data])
  const vaultIdx = vaultRootId ? chain.findIndex((a) => a.id === vaultRootId) : -1

  useEffect(() => {
    if (!vaultRootId || vaultIdx < 0 || !e2e.isUnlocked()) return
    let cancelled = false
    void (async () => {
      const out: Record<string, string> = {}
      for (let i = vaultIdx + 1; i < chain.length; i++) {
        try {
          out[chain[i].id] = await e2e.decryptName(vaultRootId, chain[i].name)
        } catch {
          out[chain[i].id] = "잠김"
        }
      }
      if (!cancelled) setDec(out)
    })()
    return () => {
      cancelled = true
    }
  }, [vaultRootId, vaultIdx, chain])

  const root = node.scope === "personal" ? "내 파일" : "워크스페이스"
  const names = chain.map((a, i) => (vaultIdx >= 0 && i > vaultIdx ? (dec[a.id] ?? "잠김") : a.name))
  return [root, ...names].join(" / ")
}

export function InfoPanel({
  node,
  name,
  kind,
  vaultRootId,
}: {
  node: NodeResponse
  name: string
  kind: FileKind
  vaultRootId: string | null
}) {
  const owner = useOwnerName(node.owner_id)
  const location = useLocation(node, vaultRootId)
  const { shares, linkCount, linksKnown, loading } = useShareSummary(node)
  const ext = extOf(name).toUpperCase()

  return (
    <div className="divide-y divide-border" data-testid={`${T}-info`}>
      <Row label="종류">
        {KIND_META[kind].label}
        {ext && ext !== KIND_META[kind].label && <span className="text-muted-foreground"> ({ext})</span>}
      </Row>
      <Row label="크기">
        <span className="tabular-nums">{formatBytes(node.size_bytes)}</span>
      </Row>
      <Row label="위치">{location}</Row>
      <Row label="소유자">
        <span className="inline-flex items-center gap-1.5">
          <Avatar id={node.owner_id} name={owner} size={20} />
          {owner}
        </span>
      </Row>
      <Row label="수정">{relativeTime(node.updated_at)}</Row>
      <Row label="만든 날짜">{relativeTime(node.created_at)}</Row>
      <Row label="공유">
        {loading ? "" : shares.length > 0 ? `${shares.length}명` : "비공개"}
        {linksKnown && linkCount > 0 && <span className="text-muted-foreground">, 링크 {linkCount}개</span>}
      </Row>
      {vaultRootId && (
        <Row label="보안">
          <span className="inline-flex items-center gap-1">
            <Lock className="size-3.5" />
            종단간 암호화
          </span>
        </Row>
      )}
    </div>
  )
}

export function VersionsPanel({
  node,
  name,
  vaultRootId,
  ensureUnlocked,
  onRestored,
}: {
  node: NodeResponse
  name: string
  vaultRootId: string | null
  ensureUnlocked?: () => Promise<void>
  onRestored: () => void
}) {
  const { toast } = useToast()
  const url = `/api/v1/nodes/${node.id}/versions`
  const { data, error, isLoading, mutate } = useApiGet<FileVersionResponse[]>(url)
  const [asking, setAsking] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (error?.status === 403) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground" data-testid={`${T}-versions-forbidden`}>
        편집 권한이 있어야 볼 수 있습니다
      </p>
    )
  }
  if (isLoading) {
    return (
      <div className="flex justify-center py-6 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    )
  }

  const versions = data ?? []
  const total = versions.length + 1

  async function restore(v: FileVersionResponse) {
    setBusy(true)
    try {
      await api(`${url}/${v.id}/restore`, { method: "POST" })
      toast.success("복원했습니다")
      setAsking(null)
      invalidateApi("/api/v1/me/storage")
      invalidateApi("/api/v1/nodes")
      await mutate()
      onRestored()
    } catch (e) {
      toast.error(`복원 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function download(v: FileVersionResponse) {
    try {
      await downloadSource({ path: `${url}/${v.id}/download-url`, vaultRootId, ensureUnlocked }, name)
    } catch (e) {
      toast.error(`다운로드 실패: ${(e as Error).message}`)
    }
  }

  return (
    <ol className="space-y-0.5" data-testid={`${T}-versions`}>
      <li className="flex items-center gap-3 rounded-md px-2 py-2">
        <TimelineDot current last={versions.length === 0} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground">
            버전 {total}
            <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary dark:bg-primary/25 dark:text-foreground">
              현재
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {relativeTime(node.updated_at)}, <span className="tabular-nums">{formatBytes(node.size_bytes)}</span>
          </p>
        </div>
      </li>
      {versions.map((v, i) => (
        <li
          key={v.id}
          className="group rounded-md px-2 py-2 hover:bg-muted/60"
          data-testid={`${T}-version-${v.id}`}
        >
          <div className="flex items-center gap-3">
            <TimelineDot last={i === versions.length - 1} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">버전 {versions.length - i}</p>
              <p className="truncate text-xs text-muted-foreground">
                {v.saved_by_name ?? v.saved_by}, {relativeTime(v.saved_at)},{" "}
                <span className="tabular-nums">{formatBytes(v.size_bytes)}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => download(v)}
              disabled={busy}
              title="다운로드"
              data-testid={`${T}-version-${v.id}-download`}
              className="rounded p-1.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <Download className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setAsking(asking === v.id ? null : v.id)}
              disabled={busy}
              title="복원"
              data-testid={`${T}-version-${v.id}-restore`}
              className={cn(
                "rounded p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40",
                asking === v.id ? "bg-muted text-foreground opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              )}
            >
              <RotateCcw className="size-3.5" />
            </button>
          </div>
          {asking === v.id && (
            <div className="mt-2 ml-5 flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2">
              <span className="min-w-0 flex-1 text-xs">
                <span className="block font-medium text-foreground">v{versions.length - i}으로 복원</span>
                <span className="block text-muted-foreground">현재 버전은 기록에 남음</span>
              </span>
              <button
                type="button"
                onClick={() => setAsking(null)}
                data-testid={`${T}-version-${v.id}-restore-cancel`}
                className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => restore(v)}
                disabled={busy}
                data-testid={`${T}-version-${v.id}-restore-confirm`}
                className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                복원
              </button>
            </div>
          )}
        </li>
      ))}
      {versions.length === 0 && (
        <li className="px-2 pt-3 text-xs text-muted-foreground" data-testid={`${T}-versions-empty`}>
          이전 버전 없음
        </li>
      )}
    </ol>
  )
}

function TimelineDot({ current, last }: { current?: boolean; last: boolean }) {
  return (
    <div className="relative flex flex-col items-center self-stretch">
      <span className={cn("mt-1.5 size-2 rounded-full", current ? "bg-primary dark:bg-foreground" : "bg-muted-foreground/40")} />
      {!last && <span className="absolute top-5 -bottom-4 w-px bg-border" />}
    </div>
  )
}

export function SharePanel({
  node,
  onShare,
}: {
  node: NodeResponse
  onShare?: (node: NodeResponse) => void
}) {
  const owner = useOwnerName(node.owner_id)
  const { shares, loading, linkCount, linksKnown } = useShareSummary(node)

  return (
    <div className="space-y-5" data-testid={`${T}-share`}>
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">사용자</p>
        <ul className="space-y-1">
          <li className="flex items-center gap-2.5 py-1">
            <Avatar id={node.owner_id} name={owner} />
            <span className="flex-1 truncate text-sm text-foreground">{owner}</span>
            <span className="text-xs text-muted-foreground">소유자</span>
          </li>
          {shares.map((s) => {
            const label = s.grantee_name || s.grantee_email || s.grantee_sub
            return (
              <li key={s.id} className="flex items-center gap-2.5 py-1" data-testid={`${T}-share-${s.id}`}>
                <Avatar id={s.grantee_sub} name={label} />
                <span className="flex-1 truncate text-sm text-foreground" title={s.grantee_email ?? undefined}>
                  {label}
                </span>
                <span className="text-xs text-muted-foreground">{PERM[s.permission] ?? s.permission}</span>
              </li>
            )
          })}
          {loading && (
            <li className="flex justify-center py-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </li>
          )}
        </ul>
      </div>
      {linksKnown && (
        <div className="flex items-center gap-2 rounded-lg border border-border p-3">
          {linkCount > 0 ? (
            <Globe className="size-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Lock className="size-4 text-muted-foreground" />
          )}
          <span className="flex-1 text-sm text-foreground">
            {linkCount > 0 ? `링크 공유 중${linkCount > 1 ? ` (${linkCount}개)` : ""}` : "링크 없음"}
          </span>
        </div>
      )}
      {onShare && (
        <button
          type="button"
          onClick={() => onShare(node)}
          data-testid={`${T}-share-open`}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-muted"
        >
          <Share2 className="size-3.5" />
          공유 관리
        </button>
      )}
    </div>
  )
}
