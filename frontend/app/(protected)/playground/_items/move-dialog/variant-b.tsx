"use client"

import { useMemo, useState } from "react"
import { Check, ChevronLeft, ChevronRight, Folder, FolderPlus, Lock, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import {
  CURRENT_LOCATION,
  Highlight,
  MOVING,
  MOVING_TITLE,
  ROOTS,
  RootIcon,
  KindIcon,
  nextFolderName,
  useFolders,
  type MoveFolder,
} from "./shared"

const T = "pg-move-dialog-b"

/** B: 한 단계씩 들어가는 탐색 + 경로 표시. 들어간 곳이 곧 목적지 */
export function VariantB() {
  const fx = useFolders()
  // null = 위치 목록(내 파일 + 워크스페이스)
  const [here, setHere] = useState<string | null>("f-meeting")
  const [dir, setDir] = useState<"in" | "out">("in")
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState("")
  const [newName, setNewName] = useState<string | null>(null)
  const [moved, setMoved] = useState<string | null>(null)

  const crumbs = here ? fx.keyPathOf(here) : []
  const kids = here ? fx.childrenOfKey(here) : []

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

  function commitCreate() {
    if (!here || newName === null) return
    const name = newName.trim()
    if (name) fx.addFolder(here, name)
    setNewName(null)
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return fx.folders.filter((f) => f.name.toLowerCase().includes(q))
  }, [query, fx.folders])

  const isCurrent = here === CURRENT_LOCATION
  const canMove = !!here && !isCurrent && !fx.isVault(here)
  const title = here ? fx.labelOf(here) : "위치"

  return (
    <div className="flex h-[600px] w-[420px] max-w-[92vw] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
      {/* 상단: 옮기는 항목 */}
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
        <KindIcon kind={MOVING[0].kind} size={14} />
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{MOVING_TITLE}</span> 이동
        </span>
        <button
          data-testid={`${T}-close`}
          className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>

      {/* 제목 + 경로 */}
      {searching ? (
        <div className="flex h-[92px] items-center gap-2 px-3">
          <div className="flex h-10 flex-1 items-center gap-2 rounded-lg bg-muted px-3">
            <Search size={16} className="shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="모든 위치에서 검색"
              data-testid={`${T}-search`}
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
            data-testid={`${T}-search-cancel`}
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
              data-testid={`${T}-back`}
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:invisible"
            >
              <ChevronLeft size={18} />
            </button>
            <h3 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h3>
            <button
              onClick={() => setSearching(true)}
              data-testid={`${T}-search-open`}
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Search size={16} />
            </button>
          </div>
          <nav className="mt-1.5 flex min-h-6 items-center gap-0.5 overflow-hidden pl-1 text-xs text-muted-foreground">
            <button
              onClick={() => go(null, "out")}
              data-testid={`${T}-crumb-top`}
              className={cn("shrink-0 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground", !here && "text-foreground")}
            >
              위치
            </button>
            {crumbs.map((k, i) => (
              <span key={k} className="flex min-w-0 items-center gap-0.5">
                <ChevronRight size={12} className="shrink-0 opacity-60" />
                <button
                  onClick={() => go(k, "out")}
                  disabled={i === crumbs.length - 1}
                  data-testid={`${T}-crumb-${k}`}
                  className="truncate rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground disabled:text-foreground disabled:hover:bg-transparent"
                >
                  {fx.labelOf(k)}
                </button>
              </span>
            ))}
          </nav>
        </div>
      )}

      {/* 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto border-t">
        {searching ? (
          <ul className="py-1">
            {results.map((f) => {
              const path = fx.pathOf(f.id)
              return (
                <li key={f.id}>
                  <button
                    onClick={() => go(f.id, "in")}
                    disabled={f.vault}
                    data-testid={`${T}-result-${f.id}`}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    <FolderTile vault={f.vault} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        <Highlight text={f.name} query={query} />
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {path.slice(0, -1).join(" / ")}
                      </span>
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
              <TopLevel onOpen={(k) => go(k, "in")} />
            ) : (
              <ul className="py-1">
                {newName !== null && (
                  <li className="flex items-center gap-3 px-4 py-2">
                    <FolderTile />
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitCreate()
                        if (e.key === "Escape") setNewName(null)
                      }}
                      data-testid={`${T}-new-folder-input`}
                      className="h-8 min-w-0 flex-1 rounded-md border border-ring bg-background px-2 text-sm outline-none ring-2 ring-ring/30"
                    />
                    <Button size="sm" onClick={commitCreate} data-testid={`${T}-new-folder-ok`}>
                      만들기
                    </Button>
                  </li>
                )}
                {kids.map((f) => (
                  <FolderRow key={f.id} f={f} sub={fx.childrenOfKey(f.id).length} onOpen={() => go(f.id, "in")} />
                ))}
                {kids.length === 0 && newName === null && (
                  <p className="py-16 text-center text-sm text-muted-foreground">하위 폴더 없음</p>
                )}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* 하단 */}
      <div className="flex items-center gap-2 border-t px-3 py-3">
        <Button
          variant="outline"
          size="icon"
          onClick={() => here && setNewName(nextFolderName(kids))}
          disabled={!here || newName !== null || searching}
          data-testid={`${T}-new-folder`}
          title="새 폴더"
        >
          <FolderPlus size={16} />
        </Button>
        <div className="flex-1" />
        {moved ? (
          <span className="inline-flex items-center gap-1.5 pr-1 text-sm text-emerald-700 dark:text-emerald-400">
            <Check size={15} /> {moved}: 이동됨
          </span>
        ) : (
          <Button
            onClick={() => here && setMoved(fx.labelOf(here))}
            disabled={!canMove || searching}
            data-testid={`${T}-submit`}
            className="min-w-32"
          >
            {isCurrent ? "현재 위치" : "여기로 이동"}
          </Button>
        )}
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

function FolderRow({ f, sub, onOpen }: { f: MoveFolder; sub: number; onOpen: () => void }) {
  return (
    <li>
      <button
        onClick={onOpen}
        disabled={f.vault}
        data-testid={`pg-move-dialog-b-folder-${f.id}`}
        className="group flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        <FolderTile vault={f.vault} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm", f.vault && "text-muted-foreground")}>{f.name}</span>
          <span className="block text-xs text-muted-foreground">
            {f.vault ? "보안 폴더: 이동 불가" : sub > 0 ? `폴더 ${sub}개` : "폴더 없음"}
          </span>
        </span>
        {!f.vault && <ChevronRight size={16} className="shrink-0 text-muted-foreground/60 group-hover:text-foreground" />}
      </button>
    </li>
  )
}

function TopLevel({ onOpen }: { onOpen: (key: string) => void }) {
  return (
    <div className="py-2">
      {ROOTS.map((r, i) => (
        <div key={r.id}>
          {i === 1 && <div className="px-4 pt-3 pb-1 text-[11px] font-medium text-muted-foreground">워크스페이스</div>}
          <button
            onClick={() => onOpen(r.id)}
            data-testid={`pg-move-dialog-b-root-${r.id}`}
            className="group flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted">
              <RootIcon root={r} size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{r.name}</span>
              <span className="block text-xs text-muted-foreground">
                {r.id === CURRENT_LOCATION ? "현재 위치" : r.members ? `멤버 ${r.members}명` : ""}
              </span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-muted-foreground/60 group-hover:text-foreground" />
          </button>
        </div>
      ))}
    </div>
  )
}
