"use client"

import { useMemo, useState } from "react"
import { Check, ChevronRight, Folder, FolderOpen, FolderPlus, Lock, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import {
  CURRENT_LOCATION,
  Highlight,
  MOVING,
  MOVING_TITLE,
  MovingStack,
  ROOTS,
  RootIcon,
  nextFolderName,
  useFolders,
  type MoveFolder,
  type MoveRoot,
} from "./shared"

const T = "pg-move-dialog-a"

/** A: 펼치는 트리. 내 파일과 워크스페이스를 한 트리에서 고른다 */
export function VariantA() {
  const fx = useFolders()
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(["mine", "f-design", "f-meeting", "f-meeting-2026"]),
  )
  const [selected, setSelected] = useState<string | null>("f-meeting-2026-10")
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState<{ parent: string; name: string } | null>(null)
  const [moved, setMoved] = useState(false)

  const q = query.trim().toLowerCase()

  // 검색 중이면 일치 폴더와 그 조상만 보인다
  const visible = useMemo(() => {
    if (!q) return null
    const set = new Set<string>()
    for (const f of fx.folders) {
      if (f.vault || !f.name.toLowerCase().includes(q)) continue
      for (const k of fx.keyPathOf(f.id)) set.add(k)
    }
    return set
  }, [q, fx])

  const isOpen = (key: string) => (visible ? visible.has(key) : expanded.has(key))

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function startCreate() {
    const parent = selected ?? "mine"
    setQuery("")
    setExpanded((prev) => new Set([...prev, ...fx.keyPathOf(parent)]))
    setCreating({ parent, name: nextFolderName(fx.childrenOfKey(parent)) })
  }

  function commitCreate() {
    if (!creating) return
    const name = creating.name.trim()
    if (name) setSelected(fx.addFolder(creating.parent, name))
    setCreating(null)
  }

  const canMove = !!selected && selected !== CURRENT_LOCATION && !fx.isVault(selected)

  function renderFolder(f: MoveFolder, depth: number) {
    if (visible && !visible.has(f.id)) return null
    const kids = fx.childrenOf(f.rootId, f.id)
    const open = isOpen(f.id)
    const isSel = selected === f.id
    const disabled = !!f.vault
    return (
      <div key={f.id}>
        <Row
          testId={`${T}-folder-${f.id}`}
          depth={depth}
          open={open}
          hasKids={kids.length > 0 || creating?.parent === f.id}
          onToggle={() => toggle(f.id)}
          onSelect={() => !disabled && setSelected(f.id)}
          selected={isSel}
          disabled={disabled}
          icon={
            f.vault ? (
              <Lock size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
            ) : open && kids.length > 0 ? (
              <FolderOpen size={15} className="shrink-0 text-sky-600 dark:text-sky-400" />
            ) : (
              <Folder size={15} className="shrink-0 text-sky-600 dark:text-sky-400" />
            )
          }
          label={<Highlight text={f.name} query={query} />}
          trailing={f.vault ? <Tag>보안 폴더</Tag> : null}
        />
        {open && !f.vault && (
          <>
            {kids.map((k) => renderFolder(k, depth + 1))}
            {creating?.parent === f.id && createRow(depth + 1)}
          </>
        )}
      </div>
    )
  }

  function renderRoot(r: MoveRoot) {
    if (visible && !visible.has(r.id)) return null
    const kids = fx.childrenOf(r.id, null)
    const open = isOpen(r.id)
    const isCurrent = r.id === CURRENT_LOCATION
    return (
      <div key={r.id}>
        <Row
          testId={`${T}-root-${r.id}`}
          depth={0}
          open={open}
          hasKids
          onToggle={() => toggle(r.id)}
          onSelect={() => !isCurrent && setSelected(r.id)}
          selected={selected === r.id}
          disabled={isCurrent}
          icon={<RootIcon root={r} size={15} />}
          label={<span className="font-medium">{r.name}</span>}
          trailing={isCurrent ? <Tag>현재 위치</Tag> : r.members ? <Count n={r.members} /> : null}
        />
        {open && (
          <>
            {kids.map((k) => renderFolder(k, 1))}
            {creating?.parent === r.id && createRow(1)}
          </>
        )}
      </div>
    )
  }

  function createRow(depth: number) {
    return (
      <div className="flex h-8 items-center gap-1.5 pr-2" style={{ paddingLeft: 8 + depth * 18 + 18 }}>
        <FolderPlus size={15} className="shrink-0 text-sky-600 dark:text-sky-400" />
        <input
          autoFocus
          value={creating?.name ?? ""}
          onChange={(e) => setCreating((c) => (c ? { ...c, name: e.target.value } : c))}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitCreate()
            if (e.key === "Escape") setCreating(null)
          }}
          data-testid={`${T}-new-folder-input`}
          className="h-6 min-w-0 flex-1 rounded border border-ring bg-background px-1.5 text-sm outline-none ring-2 ring-ring/30"
        />
        <button
          onClick={commitCreate}
          data-testid={`${T}-new-folder-ok`}
          className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => setCreating(null)}
          data-testid={`${T}-new-folder-cancel`}
          className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  const mine = ROOTS.filter((r) => r.kind === "mine")
  const workspaces = ROOTS.filter((r) => r.kind === "workspace")
  const showWsLabel = !visible || workspaces.some((w) => visible.has(w.id))

  return (
    <div className="flex h-[600px] w-[480px] max-w-[92vw] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
      <div className="flex items-start gap-3 px-5 pt-5 pb-4">
        <MovingStack />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold">{MOVING_TITLE} 이동</h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {MOVING.map((n) => n.name).join(", ")}
          </p>
        </div>
        <button
          data-testid={`${T}-close`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>

      <div className="px-5 pb-3">
        <div className="flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-2.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
          <Search size={15} className="shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="폴더 검색"
            data-testid={`${T}-search`}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              data-testid={`${T}-search-clear`}
              className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-y bg-muted/20 px-2 py-2">
        {mine.map(renderRoot)}
        {showWsLabel && (
          <div className="px-2 pt-4 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground">워크스페이스</div>
        )}
        {workspaces.map(renderRoot)}
        {visible && visible.size === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">일치하는 폴더 없음</p>
        )}
      </div>

      <div className="flex items-center gap-2 px-5 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={startCreate}
          disabled={!!creating || (!!selected && fx.isVault(selected))}
          data-testid={`${T}-new-folder`}
          className="-ml-2 gap-1.5 text-muted-foreground"
        >
          <FolderPlus size={15} /> 새 폴더
        </Button>
        <div className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
          {moved ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
              <Check size={13} /> 이동됨
            </span>
          ) : selected ? (
            fx.pathOf(selected).join(" / ")
          ) : null}
        </div>
        <Button variant="outline" size="sm" data-testid={`${T}-cancel`}>
          취소
        </Button>
        <Button
          size="sm"
          disabled={!canMove || moved}
          onClick={() => setMoved(true)}
          data-testid={`${T}-submit`}
        >
          이동
        </Button>
      </div>
    </div>
  )
}

function Row({
  testId,
  depth,
  open,
  hasKids,
  onToggle,
  onSelect,
  selected,
  disabled,
  icon,
  label,
  trailing,
}: {
  testId: string
  depth: number
  open: boolean
  hasKids: boolean
  onToggle: () => void
  onSelect: () => void
  selected: boolean
  disabled: boolean
  icon: React.ReactNode
  label: React.ReactNode
  trailing: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "group flex h-8 items-center gap-1 rounded-md pr-2 text-sm",
        selected ? "bg-primary text-primary-foreground" : "hover:bg-accent",
        disabled && "text-muted-foreground hover:bg-transparent",
      )}
      style={{ paddingLeft: 4 + depth * 18 }}
    >
      <button
        onClick={onToggle}
        disabled={!hasKids}
        data-testid={`${testId}-toggle`}
        className={cn(
          "grid h-6 w-5 shrink-0 place-items-center rounded",
          !hasKids && "invisible",
          selected ? "text-primary-foreground/70" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <ChevronRight size={14} className={cn("transition-transform", open && "rotate-90")} />
      </button>
      <button
        onClick={onSelect}
        onDoubleClick={onToggle}
        aria-disabled={disabled}
        data-testid={testId}
        className={cn(
          "flex h-full min-w-0 flex-1 items-center gap-2 text-left",
          disabled && "cursor-not-allowed",
          selected && "[&_svg]:text-primary-foreground [&_mark]:bg-transparent [&_mark]:text-primary-foreground",
        )}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {trailing}
      </button>
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded border bg-background px-1.5 py-px text-[10px] font-medium text-muted-foreground">
      {children}
    </span>
  )
}

function Count({ n }: { n: number }) {
  return <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground group-hover:text-foreground/60">{n}명</span>
}
