"use client"

/**
 * 휴지통 (playground trash-page A): 표 + 자동 삭제까지 남은 기간.
 *
 * 원래 위치: 노드의 parent_id 조상 체인(/ancestors, 지운 노드도 조회됨) + scope 루트 이름.
 * 보존 기간: GET /nodes/trash 의 retention_days (백엔드 settings.trash_retention_days).
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import { Check, CornerUpLeft, Folder, Minus, RotateCcw, Trash2, X } from "lucide-react"

import { api } from "@/lib/api-client"
import { invalidateApi, useApiGet } from "@/lib/hooks/use-api"
import { cn } from "@/lib/utils"
import { formatBytes } from "@/lib/utils/format"
import type { AncestorsResponse, NodeResponse } from "@/lib/types/api"
import { useToast } from "@/components/ui-custom/use-toast"
import { FileGlyph, kindOf, plainSize, relativeTime } from "@/components/files/file-meta"

const DAY = 86_400_000
/** 폴더 삭제가 자손을 cascade 로 지우는 시간 오차 */
const CASCADE_MS = 5_000

export function daysLeft(deletedAt: string, retentionDays: number, now = Date.now()): number {
  const passed = Math.floor((now - new Date(deletedAt).getTime()) / DAY)
  return Math.max(0, retentionDays - passed)
}

/** 남은 기간 색: 보존 기간의 1/4 이하 rose, 절반 이하 amber (30일이면 7일, 15일) */
function urgency(left: number, retentionDays: number): { pill: string; bar: string } {
  if (left <= Math.floor(retentionDays / 4))
    return { pill: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300", bar: "bg-rose-500 dark:bg-rose-400" }
  if (left <= Math.floor(retentionDays / 2))
    return { pill: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300", bar: "bg-amber-500 dark:bg-amber-400" }
  return { pill: "bg-muted text-muted-foreground", bar: "bg-muted-foreground/40" }
}

function CheckBox({ state }: { state: "on" | "off" | "some" }) {
  return (
    <span
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded border border-input bg-background transition-colors",
        state !== "off" && "border-primary bg-primary text-primary-foreground",
      )}
    >
      {state === "on" && <Check className="size-3" strokeWidth={3} />}
      {state === "some" && <Minus className="size-3" strokeWidth={3} />}
    </span>
  )
}

export function TrashView({ nodes, retentionDays }: { nodes: NodeResponse[]; retentionDays: number }) {
  const { toast } = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [confirmRow, setConfirmRow] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 폴더를 지우면 자손도 같이 soft-delete 되어 목록에 따로 온다. 같은 삭제로 들어온 자손은
  // 맨 위 폴더 한 줄로 묶고(항목 N개), 복원할 때 같이 복원한다 (백엔드 복원은 노드 단위).
  const { items, members } = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const t = (n: NodeResponse) => new Date(n.deleted_at ?? 0).getTime()
    const topOf = (n: NodeResponse): NodeResponse => {
      let top = n
      let cur = n.parent_id ? byId.get(n.parent_id) : undefined
      while (cur) {
        // 부모가 같은 삭제(또는 이후)로 지워졌을 때만 묶는다. 먼저 따로 지운 파일은 따로.
        if (t(n) >= t(cur) - CASCADE_MS) top = cur
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
      }
      return top
    }
    const groups = new Map<string, string[]>()
    const tops: NodeResponse[] = []
    for (const n of nodes) {
      const top = topOf(n)
      if (top.id === n.id) tops.push(n)
      else groups.set(top.id, [...(groups.get(top.id) ?? []), n.id])
    }
    tops.sort((a, b) => t(b) - t(a))
    return { items: tops, members: groups }
  }, [nodes])
  const trashIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes])
  const totalSize = nodes.reduce((s, n) => s + (plainSize(n) ?? 0), 0)

  const topIds = new Set(items.map((n) => n.id))
  const valid = new Set([...selected].filter((id) => topIds.has(id)))
  const sel = valid.size
  const allState = sel === 0 ? "off" : sel === items.length ? "on" : "some"

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function label(ids: string[]) {
    if (ids.length === 1) return nodes.find((n) => n.id === ids[0])?.name ?? "1개 항목"
    return `${ids.length}개 항목`
  }

  async function restore(ids: string[]) {
    setBusy(true)
    // 맨 위 노드 먼저, 그다음 같이 지워진 자손
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        await api(`/api/v1/nodes/${id}/restore`, { method: "POST" })
        await Promise.all((members.get(id) ?? []).map((m) => api(`/api/v1/nodes/${m}/restore`, { method: "POST" })))
      }),
    )
    const ok = results.filter((r) => r.status === "fulfilled").length
    const fail = results.length - ok
    if (fail === 0) toast.success(`${label(ids)} 복원`)
    else toast.error(`${ok}개 복원, ${fail}개 실패`)
    setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))))
    invalidateApi("/api/v1/nodes")
    setBusy(false)
  }

  // 선택 항목 영구 삭제: 백엔드 POST /nodes/trash/purge {ids} (휴지통 비우기의 선택 버전)
  async function purge(ids: string[]) {
    setBusy(true)
    try {
      const res = await api<{ purged: number }>("/api/v1/nodes/trash/purge", { method: "POST", body: { ids } })
      toast.success(`${res.purged === 1 && ids.length === 1 ? label(ids) : `${res.purged}개 항목`} 영구 삭제`)
      setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))))
    } catch (e) {
      toast.error(`영구 삭제 실패: ${(e as Error).message}`)
    } finally {
      invalidateApi("/api/v1/nodes")
      invalidateApi("/api/v1/me")
      setBusy(false)
    }
  }

  async function emptyAll() {
    setBusy(true)
    try {
      const res = await api<{ purged: number }>("/api/v1/nodes/trash", { method: "DELETE" })
      toast.success(`${res.purged}개 항목 영구 삭제`)
      setSelected(new Set())
    } catch (e) {
      toast.error(`비우기 실패: ${(e as Error).message}`)
    } finally {
      invalidateApi("/api/v1/nodes")
      invalidateApi("/api/v1/me")
      setBusy(false)
    }
  }

  return (
    <div data-testid="files-trash">
      <header className="mb-5 flex min-h-9 flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">휴지통</h1>
        <span className="text-sm text-muted-foreground tabular-nums" data-testid="files-trash-summary">
          {items.length}개, {formatBytes(totalSize)}
        </span>
        <div className="flex-1" />
        {items.length > 0 && !confirmEmpty && (
          <button
            type="button"
            data-testid="files-trash-empty-button"
            onClick={() => setConfirmEmpty(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="size-4" />
            휴지통 비우기
          </button>
        )}
      </header>

      {confirmEmpty && (
        <div
          className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900/60 dark:bg-rose-950/40"
          data-testid="files-trash-empty-confirm-bar"
        >
          <Trash2 className="size-4 text-rose-600 dark:text-rose-400" />
          <p className="flex-1 text-sm text-rose-900 dark:text-rose-200">
            {items.length}개 항목, {formatBytes(totalSize)} 영구 삭제
          </p>
          <button
            type="button"
            data-testid="files-trash-empty-cancel"
            onClick={() => setConfirmEmpty(false)}
            className="h-8 rounded-md px-3 text-sm text-rose-900 hover:bg-rose-100 dark:text-rose-200 dark:hover:bg-rose-900/40"
          >
            취소
          </button>
          <button
            type="button"
            data-testid="files-trash-empty-confirm"
            disabled={busy}
            onClick={async () => {
              await emptyAll()
              setConfirmEmpty(false)
            }}
            className="h-8 rounded-md bg-rose-600 px-3 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            영구 삭제
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div
          className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-24 text-muted-foreground"
          data-testid="files-empty"
        >
          <Trash2 className="size-8 opacity-50" />
          <p className="text-sm">휴지통이 비어 있음</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {sel > 0 && (
            <div className="flex h-11 items-center gap-2 border-b bg-primary/5 px-3 text-sm" data-testid="files-bulk-bar">
              <span className="font-medium tabular-nums">{sel}개 선택</span>
              <div className="flex-1" />
              {confirmBulk ? (
                <>
                  <span className="mr-1 text-rose-700 dark:text-rose-300">{sel}개 항목 영구 삭제</span>
                  <button
                    type="button"
                    data-testid="files-bulk-purge-cancel"
                    onClick={() => setConfirmBulk(false)}
                    className="h-7 rounded-md px-2.5 hover:bg-muted"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    data-testid="files-bulk-purge-confirm"
                    disabled={busy}
                    onClick={async () => {
                      await purge([...valid])
                      setConfirmBulk(false)
                    }}
                    className="h-7 rounded-md bg-rose-600 px-2.5 font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    영구 삭제
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    data-testid="files-bulk-restore"
                    disabled={busy}
                    onClick={() => void restore([...valid])}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <RotateCcw className="size-3.5" />
                    복원
                  </button>
                  <button
                    type="button"
                    data-testid="files-bulk-purge"
                    onClick={() => setConfirmBulk(true)}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                  >
                    <Trash2 className="size-3.5" />
                    영구 삭제
                  </button>
                  <button
                    type="button"
                    data-testid="files-bulk-clear"
                    aria-label="선택 해제"
                    onClick={() => setSelected(new Set())}
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                  >
                    <X className="size-4" />
                  </button>
                </>
              )}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm" data-testid="files-tree">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="w-11 py-2.5 pl-4">
                    <button
                      type="button"
                      data-testid="files-select-all"
                      aria-label="전체 선택"
                      onClick={() => setSelected(sel === items.length ? new Set() : new Set(items.map((i) => i.id)))}
                      className="flex"
                    >
                      <CheckBox state={allState} />
                    </button>
                  </th>
                  <th className="py-2.5 pr-4 font-medium">이름</th>
                  <th className="hidden w-48 py-2.5 pr-4 font-medium lg:table-cell">원래 위치</th>
                  <th className="hidden w-24 py-2.5 pr-4 font-medium sm:table-cell">삭제</th>
                  <th className="hidden w-24 py-2.5 pr-4 text-right font-medium md:table-cell">크기</th>
                  <th className="w-20 py-2.5 pr-4 font-medium sm:w-36">자동 삭제까지</th>
                  <th className="w-20 py-2.5 pr-4 sm:w-40" />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const left = it.deleted_at ? daysLeft(it.deleted_at, retentionDays) : retentionDays
                  const u = urgency(left, retentionDays)
                  const on = valid.has(it.id)
                  const confirming = confirmRow === it.id
                  const isFolder = it.kind === "folder"
                  const count = members.get(it.id)?.length ?? 0
                  return (
                    <tr
                      key={it.id}
                      data-testid={`files-row-${it.id}`}
                      onClick={() => toggle(it.id)}
                      className={cn(
                        "group h-14 cursor-pointer border-b last:border-b-0 hover:bg-muted/40",
                        on && "bg-primary/5 hover:bg-primary/10",
                      )}
                    >
                      <td className="pl-4">
                        <button
                          type="button"
                          data-testid={`files-row-${it.id}-select`}
                          aria-label={`${it.name} 선택`}
                          className="flex"
                        >
                          <CheckBox state={on ? "on" : "off"} />
                        </button>
                      </td>
                      <td className="pr-4">
                        <span className="flex min-w-0 items-center gap-3">
                          <FileGlyph kind={kindOf(it.name, it.mime, isFolder)} className="size-7" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium" title={it.name}>
                              {it.name}
                            </span>
                            {isFolder && (
                              <span className="block text-xs text-muted-foreground">항목 {count}개</span>
                            )}
                          </span>
                        </span>
                      </td>
                      <td className="hidden pr-4 lg:table-cell">
                        <Origin node={it} parentInTrash={!!it.parent_id && trashIds.has(it.parent_id)} />
                      </td>
                      <td
                        className="hidden truncate pr-4 text-muted-foreground sm:table-cell"
                        title={it.deleted_at ? new Date(it.deleted_at).toLocaleString("ko-KR") : undefined}
                      >
                        {it.deleted_at ? relativeTime(it.deleted_at) : ""}
                      </td>
                      <td className="hidden pr-4 text-right text-muted-foreground tabular-nums md:table-cell">
                        {isFolder ? "" : formatBytes(plainSize(it))}
                      </td>
                      <td className="pr-4">
                        <span className="flex items-center gap-2" data-testid={`files-row-${it.id}-days-left`}>
                          <span
                            className={cn(
                              "inline-flex w-12 justify-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
                              u.pill,
                            )}
                          >
                            {left}일
                          </span>
                          <span className="hidden h-1 w-14 overflow-hidden rounded-full bg-muted sm:block">
                            <span
                              className={cn("block h-full rounded-full", u.bar)}
                              style={{ width: `${retentionDays > 0 ? (left / retentionDays) * 100 : 0}%` }}
                            />
                          </span>
                        </span>
                      </td>
                      <td className="pr-3" onClick={(e) => e.stopPropagation()}>
                        <span
                          className={cn(
                            "flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100",
                            confirming && "opacity-100",
                          )}
                        >
                          {confirming ? (
                            <>
                              <button
                                type="button"
                                data-testid={`files-row-${it.id}-purge-cancel`}
                                onClick={() => setConfirmRow(null)}
                                className="h-7 rounded-md px-2 text-xs hover:bg-muted"
                              >
                                취소
                              </button>
                              <button
                                type="button"
                                data-testid={`files-row-${it.id}-purge-confirm`}
                                disabled={busy}
                                onClick={async () => {
                                  await purge([it.id])
                                  setConfirmRow(null)
                                }}
                                className="h-7 rounded-md bg-rose-600 px-2 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                              >
                                영구 삭제
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                data-testid={`files-row-${it.id}-restore`}
                                disabled={busy}
                                onClick={() => void restore([it.id])}
                                className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2 text-xs hover:bg-muted disabled:opacity-50"
                              >
                                <CornerUpLeft className="size-3.5" />
                                <span className="hidden sm:inline">복원</span>
                              </button>
                              <button
                                type="button"
                                data-testid={`files-row-${it.id}-purge`}
                                onClick={() => setConfirmRow(it.id)}
                                title="영구 삭제"
                                aria-label="영구 삭제"
                                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/** 원래 위치: scope 루트 + 부모 조상 체인. 부모가 살아 있으면 그 폴더로 링크 */
function Origin({ node, parentInTrash }: { node: NodeResponse; parentInTrash: boolean }) {
  const { data } = useApiGet<AncestorsResponse>(node.parent_id ? `/api/v1/nodes/${node.parent_id}/ancestors` : null)
  const root = node.scope === "shared" ? "워크스페이스" : "내 파일"
  const chain = data?.ancestors ?? []
  const path = [root, ...chain.map((a) => a.name)].join(" / ")
  const loading = !!node.parent_id && !data
  const href = node.parent_id ? `/files?scope=${node.scope}&folder=${node.parent_id}` : `/files?scope=${node.scope}`
  const inner = (
    <>
      <Folder className="size-3.5 shrink-0" />
      <span className="truncate">{loading ? root : path}</span>
    </>
  )
  const cls =
    "inline-flex max-w-full items-center gap-1.5 rounded px-1 py-0.5 text-muted-foreground"
  if (parentInTrash) {
    return (
      <span className={cls} title={path} data-testid={`files-row-${node.id}-origin`}>
        {inner}
      </span>
    )
  }
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      title={path}
      data-testid={`files-row-${node.id}-origin`}
      className={cn(cls, "hover:bg-muted hover:text-foreground")}
    >
      {inner}
    </Link>
  )
}
