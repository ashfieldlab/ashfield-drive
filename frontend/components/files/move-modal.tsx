"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  File,
  Folder,
  FolderPlus,
  HardDrive,
  Loader2,
  Lock,
  Search,
  Users,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui-custom/use-toast"
import { api } from "@/lib/api-client"
import { invalidateApi, useApiGet } from "@/lib/hooks/use-api"
import { cn } from "@/lib/utils"
import type { VaultOut } from "@/lib/e2e/api"
import type { NodeResponse, TreeResponse } from "@/lib/types/api"

const ROOT = "root"

/**
 * 파일/폴더 이동: 같은 scope 안에서 한 단계씩 들어가며 목적지를 고른다 (들어간 곳이 곧 목적지).
 * 자기 자신 + 자손 폴더는 제외(순환 방지). 보안 폴더(vault)는 잠금 표시만, 들어가거나 고를 수 없다
 * (안의 이름은 암호문). 이동은 PATCH /nodes {parent_id}.
 */
export function MoveModal({
  node,
  onClose,
}: {
  node: NodeResponse
  onClose: () => void
}) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const { data, isLoading, mutate } = useApiGet<TreeResponse>(
    `/api/v1/nodes/tree?scope=${node.scope}&recursive=true`,
  )
  const { data: vaults } = useApiGet<VaultOut[]>("/api/v1/e2e/vaults")
  const allNodes = useMemo(() => data?.nodes ?? [], [data])
  const vaultIds = useMemo(() => new Set((vaults ?? []).map((v) => v.node_id)), [vaults])

  const currentKey = node.parent_id ?? ROOT
  const rootLabel = node.scope === "shared" ? "워크스페이스" : "내 파일"

  // 목적지 후보 폴더: 자기 자신 + 자손 제외, vault 내부(자손) 숨김. vault root 는 잠금 표시.
  const folders = useMemo(() => {
    const desc = (seed: Set<string>) => {
      const set = new Set(seed)
      let changed = true
      while (changed) {
        changed = false
        for (const n of allNodes) {
          if (n.parent_id && set.has(n.parent_id) && !set.has(n.id)) {
            set.add(n.id)
            changed = true
          }
        }
      }
      return set
    }
    const excluded = desc(new Set([node.id]))
    const vaultRoots = new Set(allNodes.filter((n) => vaultIds.has(n.id)).map((n) => n.id))
    const vaultInner = desc(vaultRoots)
    return allNodes.filter(
      (n) =>
        n.kind === "folder" &&
        !n.deleted_at &&
        !excluded.has(n.id) &&
        (!vaultInner.has(n.id) || vaultRoots.has(n.id)),
    )
  }, [allNodes, node.id, vaultIds])

  const byId = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders])
  const childrenOf = useMemo(() => {
    const m = new Map<string, NodeResponse[]>()
    for (const f of folders) {
      const k = f.parent_id ?? ROOT
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(f)
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }))
    return m
  }, [folders])

  // null = 위치 목록
  const [hereRaw, setHere] = useState<string | null>(currentKey)
  const [dir, setDir] = useState<"in" | "out">("in")
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState("")
  const [newName, setNewName] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // 트리에 없는 폴더(공유받은 항목의 부모 등)면 루트로
  const here = hereRaw && hereRaw !== ROOT && !isLoading && !byId.has(hereRaw) ? ROOT : hereRaw
  const isVault = (id: string) => vaultIds.has(id)

  const keyPathOf = (key: string): string[] => {
    if (key === ROOT) return [ROOT]
    const out: string[] = []
    let cur = byId.get(key)
    while (cur) {
      out.unshift(cur.id)
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
    }
    return [ROOT, ...out]
  }
  const labelOf = (key: string) => (key === ROOT ? rootLabel : (byId.get(key)?.name ?? ""))

  const crumbs = here ? keyPathOf(here) : []
  const kids = here ? (childrenOf.get(here) ?? []) : []

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return folders.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 100)
  }, [query, folders])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onClose])

  function go(key: string | null, direction: "in" | "out") {
    setDir(direction)
    setHere(key)
    setNewName(null)
    setSearching(false)
    setQuery("")
  }

  function back() {
    if (!here) return
    go(crumbs.length > 1 ? crumbs[crumbs.length - 2] : null, "out")
  }

  function startCreate() {
    const names = new Set(kids.map((k) => k.name))
    let name = "새 폴더"
    for (let i = 2; names.has(name); i++) name = `새 폴더 ${i}`
    setNewName(name)
  }

  async function commitCreate() {
    if (!here || newName === null || creating) return
    const name = newName.trim()
    if (!name) {
      setNewName(null)
      return
    }
    setCreating(true)
    try {
      await api<NodeResponse>("/api/v1/nodes", {
        method: "POST",
        body: { parent_id: here === ROOT ? null : here, name, scope: node.scope },
      })
      setNewName(null)
      await mutate()
      invalidateApi("/api/v1/nodes")
    } catch (e) {
      toast.error(`폴더 생성 실패: ${(e as Error).message}`)
    } finally {
      setCreating(false)
    }
  }

  async function move() {
    if (!here) return
    const parentId = here === ROOT ? null : here
    if (parentId === node.parent_id) return
    setBusy(true)
    try {
      await api(`/api/v1/nodes/${node.id}`, {
        method: "PATCH",
        body: { parent_id: parentId },
      })
      toast.success("이동했습니다")
      invalidateApi("/api/v1/nodes")
      onClose()
    } catch (e) {
      toast.error(`이동 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const isCurrent = here === currentKey
  const canMove = !!here && !isCurrent && !isVault(here) && !isLoading
  const title = here ? labelOf(here) : "위치"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className="flex h-[600px] max-h-[90vh] w-[420px] max-w-full flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${node.name} 이동`}
        data-testid="files-move-modal"
      >
        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
          {node.kind === "folder" ? (
            <Folder size={14} className="shrink-0 text-sky-600 dark:text-sky-400" />
          ) : (
            <File size={14} className="shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{node.name}</span> 이동
          </span>
          <button
            onClick={onClose}
            data-testid="files-move-close"
            aria-label="닫기"
            className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>

        {searching ? (
          <div className="flex h-[92px] items-center gap-2 px-3">
            <div className="flex h-10 flex-1 items-center gap-2 rounded-lg bg-muted px-3">
              <Search size={16} className="shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation()
                    e.nativeEvent.stopImmediatePropagation()
                    setSearching(false)
                    setQuery("")
                  }
                }}
                placeholder={`${rootLabel}에서 검색`}
                data-testid="files-move-search-input"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearching(false)
                setQuery("")
              }}
              data-testid="files-move-search-cancel"
            >
              취소
            </Button>
          </div>
        ) : (
          <div className="px-3 pt-2.5 pb-3">
            <div className="flex h-8 items-center gap-1">
              <button
                onClick={back}
                disabled={!here}
                data-testid="files-move-back"
                aria-label="뒤로"
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:invisible"
              >
                <ChevronLeft size={18} />
              </button>
              <h3 className="min-w-0 flex-1 truncate text-lg font-semibold" data-testid="files-move-title">
                {title}
              </h3>
              <button
                onClick={() => setSearching(true)}
                data-testid="files-move-search-open"
                aria-label="검색"
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Search size={16} />
              </button>
            </div>
            <nav className="mt-1.5 flex min-h-6 items-center gap-0.5 overflow-hidden pl-1 text-xs text-muted-foreground">
              <button
                onClick={() => go(null, "out")}
                data-testid="files-move-crumb-top"
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground",
                  !here && "text-foreground",
                )}
              >
                위치
              </button>
              {crumbs.map((k, i) => (
                <span key={k} className="flex min-w-0 items-center gap-0.5">
                  <ChevronRight size={12} className="shrink-0 opacity-60" />
                  <button
                    onClick={() => go(k, "out")}
                    disabled={i === crumbs.length - 1}
                    data-testid={`files-move-crumb-${k}`}
                    className="truncate rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground disabled:text-foreground disabled:hover:bg-transparent"
                  >
                    {labelOf(k)}
                  </button>
                </span>
              ))}
            </nav>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto border-t" data-testid="files-move-list">
          {isLoading ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : searching ? (
            <ul className="py-1">
              {results.map((f) => {
                const path = keyPathOf(f.id).slice(0, -1).map(labelOf)
                const locked = isVault(f.id)
                return (
                  <li key={f.id}>
                    <button
                      onClick={() => go(f.id, "in")}
                      disabled={locked}
                      data-testid={`files-move-result-${f.id}`}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent"
                    >
                      <FolderTile vault={locked} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          <Highlight text={f.name} query={query} />
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{path.join(" / ")}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
              {query.trim() && results.length === 0 && (
                <p className="py-12 text-center text-sm text-muted-foreground">결과 없음</p>
              )}
            </ul>
          ) : (
            <div
              key={here ?? "top"}
              className={cn(
                "animate-in fade-in duration-200",
                dir === "in" ? "slide-in-from-right-6" : "slide-in-from-left-6",
              )}
            >
              {here === null ? (
                <div className="py-2">
                  <button
                    onClick={() => go(ROOT, "in")}
                    data-testid="files-move-root"
                    className="group flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      {node.scope === "shared" ? <Users size={17} /> : <HardDrive size={17} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{rootLabel}</span>
                      <span className="block text-xs text-muted-foreground">
                        {currentKey === ROOT ? "현재 위치" : `폴더 ${(childrenOf.get(ROOT) ?? []).length}개`}
                      </span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-muted-foreground/60 group-hover:text-foreground" />
                  </button>
                </div>
              ) : (
                <ul className="py-1">
                  {newName !== null && (
                    <li className="flex items-center gap-3 px-4 py-2">
                      <FolderTile />
                      <input
                        autoFocus
                        value={newName}
                        disabled={creating}
                        onChange={(e) => setNewName(e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitCreate()
                          if (e.key === "Escape") {
                            e.stopPropagation()
                            e.nativeEvent.stopImmediatePropagation()
                            setNewName(null)
                          }
                        }}
                        data-testid="files-move-new-folder-input"
                        className="h-8 min-w-0 flex-1 rounded-md border border-ring bg-background px-2 text-sm ring-2 ring-ring/30 outline-none"
                      />
                      <Button
                        size="sm"
                        onClick={() => void commitCreate()}
                        disabled={creating}
                        data-testid="files-move-new-folder-ok"
                      >
                        {creating && <Loader2 className="animate-spin" />}
                        만들기
                      </Button>
                    </li>
                  )}
                  {kids.map((f) => (
                    <FolderRow
                      key={f.id}
                      f={f}
                      vault={isVault(f.id)}
                      current={f.id === currentKey}
                      sub={(childrenOf.get(f.id) ?? []).length}
                      onOpen={() => go(f.id, "in")}
                    />
                  ))}
                  {kids.length === 0 && newName === null && (
                    <p className="py-16 text-center text-sm text-muted-foreground">하위 폴더 없음</p>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t px-3 py-3">
          <Button
            variant="outline"
            size="icon"
            onClick={startCreate}
            disabled={!here || newName !== null || searching || isLoading || (here !== null && isVault(here))}
            data-testid="files-move-new-folder"
            title="새 폴더"
            aria-label="새 폴더"
          >
            <FolderPlus size={16} />
          </Button>
          <div className="flex-1" />
          <Button
            onClick={() => void move()}
            disabled={!canMove || searching || busy}
            data-testid="files-move-submit"
            className="min-w-32"
          >
            {busy && <Loader2 className="animate-spin" />}
            {isCurrent ? "현재 위치" : "여기로 이동"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function FolderTile({ vault }: { vault?: boolean }) {
  return (
    <span
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
        vault
          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
          : "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300",
      )}
    >
      {vault ? <Lock size={16} /> : <Folder size={17} />}
    </span>
  )
}

function FolderRow({
  f,
  vault,
  current,
  sub,
  onOpen,
}: {
  f: NodeResponse
  vault: boolean
  current: boolean
  sub: number
  onOpen: () => void
}) {
  return (
    <li>
      <button
        onClick={onOpen}
        disabled={vault}
        data-testid={`files-move-target-${f.id}`}
        className="group flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        <FolderTile vault={vault} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm", vault && "text-muted-foreground")}>{f.name}</span>
          <span className="block text-xs text-muted-foreground">
            {vault ? "보안 폴더" : current ? "현재 위치" : sub > 0 ? `폴더 ${sub}개` : "폴더 없음"}
          </span>
        </span>
        {!vault && <ChevronRight size={16} className="shrink-0 text-muted-foreground/60 group-hover:text-foreground" />}
      </button>
    </li>
  )
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-amber-200/70 px-0.5 text-foreground dark:bg-amber-500/30">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  )
}
