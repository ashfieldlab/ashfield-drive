"use client"

import { useMemo, useState } from "react"
import { Check, Clock, CornerDownLeft, Folder, FolderPlus, Lock, Search, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import {
  CURRENT_LOCATION,
  Highlight,
  KindIcon,
  MOVING,
  RECENT_TARGETS,
  ROOTS,
  RootIcon,
  useFolders,
} from "./shared"

const T = "pg-move-dialog-c"

type Entry =
  | { type: "target"; key: string; section: string; recent?: boolean }
  | { type: "create"; parent: string; name: string; section: string }

/** C: 검색 먼저. 명령 팔레트처럼 입력하고 고르면 바로 이동 */
export function VariantC() {
  const fx = useFolders()
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const [done, setDone] = useState<string | null>(null)

  const q = query.trim().toLowerCase()

  const entries = useMemo<Entry[]>(() => {
    if (!q) {
      return [
        ...RECENT_TARGETS.map((key): Entry => ({ type: "target", key, section: "최근", recent: true })),
        ...ROOTS.map((r): Entry => ({ type: "target", key: r.id, section: "위치" })),
      ]
    }
    const hits = fx.folders
      .filter((f) => fx.pathOf(f.id).join("/").toLowerCase().includes(q))
      // 이름 일치를 경로 일치보다 위로
      .sort((a, b) => Number(!a.name.toLowerCase().includes(q)) - Number(!b.name.toLowerCase().includes(q)))
      .slice(0, 8)
    const out: Entry[] = hits.map((f) => ({ type: "target", key: f.id, section: "폴더" }))
    const exact = fx.folders.some((f) => f.name.toLowerCase() === q)
    if (!exact) {
      const name = query.trim()
      const firstParent = hits.find((h) => !h.vault)?.id
      out.push({ type: "create", parent: "mine", name, section: "새 폴더" })
      if (firstParent) out.push({ type: "create", parent: firstParent, name, section: "새 폴더" })
    }
    return out
  }, [q, query, fx])

  const isDisabled = (e: Entry) => e.type === "target" && (e.key === CURRENT_LOCATION || fx.isVault(e.key))
  const idx = Math.min(active, Math.max(0, entries.length - 1))

  function run(e: Entry) {
    if (isDisabled(e)) return
    if (e.type === "create") {
      const id = fx.addFolder(e.parent, e.name)
      setDone(id)
    } else {
      setDone(e.key)
    }
  }

  function step(delta: number) {
    if (entries.length === 0) return
    let i = idx
    for (let n = 0; n < entries.length; n++) {
      i = (i + delta + entries.length) % entries.length
      if (!isDisabled(entries[i])) break
    }
    setActive(i)
  }

  if (done) {
    return (
      <div className="w-[560px] max-w-[92vw] overflow-hidden rounded-xl border bg-background shadow-2xl">
        <div className="flex flex-col items-center px-8 pt-10 pb-8 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
            <Check size={22} />
          </span>
          <h3 className="mt-4 text-base font-semibold">{MOVING.length}개 항목 이동됨</h3>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1 text-sm text-muted-foreground">
            {fx.pathOf(done).map((p, i, arr) => (
              <span key={i} className="flex items-center gap-1">
                <span className={cn(i === arr.length - 1 && "font-medium text-foreground")}>{p}</span>
                {i < arr.length - 1 && <span className="opacity-50">/</span>}
              </span>
            ))}
          </div>
        </div>
        <div className="flex justify-center gap-2 border-t bg-muted/30 px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => setDone(null)} data-testid={`${T}-undo`} className="gap-1.5">
            <Undo2 size={14} /> 실행 취소
          </Button>
          <Button size="sm" data-testid={`${T}-open-folder`}>
            폴더 열기
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-[600px] max-w-[92vw] overflow-hidden rounded-xl border bg-background shadow-2xl">
      {/* 옮기는 항목 */}
      <div className="flex items-center gap-1.5 overflow-hidden px-4 pt-3">
        <span className="shrink-0 text-xs text-muted-foreground">이동</span>
        {MOVING.map((n) => (
          <span
            key={n.id}
            className="inline-flex max-w-44 shrink-0 items-center gap-1 rounded-md border bg-muted/50 py-0.5 pr-2 pl-1.5 text-xs"
          >
            <KindIcon kind={n.kind} size={12} />
            <span className="truncate">{n.name}</span>
          </span>
        ))}
      </div>

      <div className="flex h-14 items-center gap-3 border-b px-4">
        <Search size={18} className="shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault()
              step(1)
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              step(-1)
            } else if (e.key === "Enter" && entries[idx]) {
              run(entries[idx])
            }
          }}
          placeholder="폴더 검색"
          data-testid={`${T}-search`}
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="max-h-[380px] min-h-[300px] overflow-y-auto p-2">
        {entries.map((e, i) => {
          const head = i === 0 || entries[i - 1].section !== e.section ? e.section : null
          const disabled = isDisabled(e)
          const on = i === idx && !disabled
          return (
            <div key={e.type === "target" ? `t-${e.key}` : `c-${e.parent}`}>
              {head && <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">{head}</div>}
              <button
                onMouseMove={() => !disabled && setActive(i)}
                onClick={() => run(e)}
                aria-disabled={disabled}
                data-testid={e.type === "target" ? `${T}-target-${e.key}` : `${T}-create-${e.parent}`}
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm",
                  on && "bg-accent",
                  disabled && "cursor-not-allowed text-muted-foreground",
                )}
              >
                {e.type === "create" ? (
                  <CreateLine parent={fx.pathOf(e.parent).join(" / ")} name={e.name} />
                ) : (
                  <TargetLine
                    keyId={e.key}
                    recent={e.recent}
                    query={query}
                    name={fx.labelOf(e.key)}
                    parentPath={fx.pathOf(e.key).slice(0, -1).join(" / ")}
                    vault={fx.isVault(e.key)}
                  />
                )}
                {on && <CornerDownLeft size={14} className="shrink-0 text-muted-foreground" />}
              </button>
            </div>
          )
        })}
        {entries.length === 0 && <p className="py-16 text-center text-sm text-muted-foreground">결과 없음</p>}
      </div>

      <div className="flex items-center gap-4 border-t bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> 선택
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> 이동
        </span>
        <span className="flex items-center gap-1">
          <Kbd>esc</Kbd> 닫기
        </span>
      </div>
    </div>
  )
}

function TargetLine({
  keyId,
  recent,
  query,
  name,
  parentPath,
  vault,
}: {
  keyId: string
  recent?: boolean
  query: string
  name: string
  parentPath: string
  vault: boolean
}) {
  const root = ROOTS.find((r) => r.id === keyId)
  return (
    <>
      {root ? (
        <RootIcon root={root} size={16} />
      ) : vault ? (
        <Lock size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />
      ) : recent ? (
        <Clock size={16} className="shrink-0 text-muted-foreground" />
      ) : (
        <Folder size={16} className="shrink-0 text-sky-600 dark:text-sky-400" />
      )}
      <span className="shrink-0 font-medium">
        <Highlight text={name} query={query} />
      </span>
      {parentPath && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{parentPath}</span>}
      {!parentPath && <span className="flex-1" />}
      {keyId === CURRENT_LOCATION && <Tag>현재 위치</Tag>}
      {vault && <Tag>보안 폴더</Tag>}
      {root?.members && <span className="shrink-0 text-xs text-muted-foreground">멤버 {root.members}명</span>}
    </>
  )
}

function CreateLine({ parent, name }: { parent: string; name: string }) {
  return (
    <>
      <FolderPlus size={16} className="shrink-0 text-primary" />
      <span className="shrink-0">
        <span className="font-medium">{name}</span> 만들고 이동
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{parent}</span>
    </>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded border px-1.5 py-px text-[10px] font-medium text-muted-foreground">{children}</span>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-grid h-[18px] min-w-[18px] place-items-center rounded border bg-background px-1 font-sans text-[10px] text-foreground/70">
      {children}
    </kbd>
  )
}
