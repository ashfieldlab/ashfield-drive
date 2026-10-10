"use client"

import { useEffect, useRef, useState } from "react"
import { CalendarClock, Check, Copy, Download, Folder, Link2, Lock, Plus, Trash2, X } from "lucide-react"

import { cn } from "@/lib/utils"

import {
  Avatar,
  EXPIRY_OPTIONS,
  INITIAL_LINK,
  NODE,
  NODE_META,
  OWNER,
  PERMS,
  PERM_ICON,
  PERM_LABEL,
  PersonCombobox,
  Switch,
  expiryDate,
  newLink,
  shortUrl,
  useCopied,
  usePeople,
  type LinkPerm,
  type Perm,
  type Person,
  type ShareLink,
} from "./shared"

const T = "pg-share-dialog-b"

// 탭: 사용자 / 링크, 링크 쪽 설정을 넓게
export function VariantB() {
  const [tab, setTab] = useState<"users" | "links">("users")
  const people = usePeople()
  const [links, setLinks] = useState<ShareLink[]>([INITIAL_LINK])

  return (
    <div className="w-[640px] max-w-full rounded-xl border bg-background shadow-2xl" data-testid={`${T}-dialog`}>
      <div className="flex items-center gap-3 border-b px-5 pt-4 pb-0">
        <div className="flex min-w-0 flex-1 items-center gap-3 pb-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <Folder size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{NODE.name}</h2>
            <p className="truncate text-xs text-muted-foreground">{NODE_META}</p>
          </div>
        </div>
        <button
          type="button"
          data-testid={`${T}-close`}
          className="mb-3 grid size-8 place-items-center self-start rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={17} />
        </button>
      </div>

      <div className="flex gap-1 border-b px-5">
        <TabBtn active={tab === "users"} onClick={() => setTab("users")} count={people.people.length} testId={`${T}-tab-users`}>
          사용자
        </TabBtn>
        <TabBtn active={tab === "links"} onClick={() => setTab("links")} count={links.length} testId={`${T}-tab-links`}>
          외부 링크
        </TabBtn>
      </div>

      {tab === "users" ? <UsersTab {...people} /> : <LinksTab links={links} setLinks={setLinks} />}

      <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
        <button
          type="button"
          data-testid={`${T}-done`}
          className="h-8 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          완료
        </button>
      </div>
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  count,
  testId,
  children,
}: {
  active: boolean
  onClick: () => void
  count: number
  testId: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "-mb-px inline-flex h-10 items-center gap-1.5 border-b-2 px-2.5 text-sm font-medium transition-colors",
        active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      <span
        className={cn(
          "min-w-5 rounded-full px-1.5 text-[11px] leading-[18px] tabular-nums",
          active ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  )
}

function Segmented<V extends string>({
  value,
  options,
  onChange,
  testId,
  size = "md",
  icons,
}: {
  value: V
  options: { value: V; label: string }[]
  onChange: (v: V) => void
  testId: string
  size?: "sm" | "md"
  icons?: boolean
}) {
  return (
    <div className={cn("inline-flex w-fit shrink-0 justify-self-start rounded-lg bg-muted p-0.5", size === "sm" && "rounded-md")}>
      {options.map((o) => {
        const Icon = icons ? PERM_ICON[o.value as Perm] : null
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            data-testid={`${testId}-${o.value}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-md font-medium transition-colors",
              size === "sm" ? "h-6 px-2 text-xs" : "h-8 px-2.5 text-sm",
              value === o.value
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/60 dark:ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon size={size === "sm" ? 12 : 14} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

const PERM_OPTS = PERMS.map((p) => ({ value: p, label: PERM_LABEL[p] }))

function UsersTab({ people, add, setPerm, remove }: ReturnType<typeof usePeople>) {
  const [perm, setPermDefault] = useState<Perm>("read")
  const [flash, setFlash] = useState<string | null>(null)
  const [removed, setRemoved] = useState<Person | null>(null)

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 1400)
    return () => clearTimeout(t)
  }, [flash])

  return (
    <div className="px-5 pt-4 pb-4">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <PersonCombobox
            testId={`${T}-person`}
            exclude={[OWNER.email, ...people.map((p) => p.email)]}
            onPick={(c) => {
              add([c], perm)
              setFlash(c.email)
              setRemoved(null)
            }}
            className="h-9"
          />
        </div>
        <Segmented value={perm} options={PERM_OPTS} onChange={setPermDefault} testId={`${T}-default-perm`} icons />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border">
        <div className="flex items-center bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <span className="flex-1">사용자</span>
          <span className="w-[164px]">권한</span>
          <span className="w-7" />
        </div>
        <ul className="max-h-[260px] divide-y overflow-y-auto">
          <li className="flex items-center gap-3 px-3 py-2">
            <Avatar person={OWNER} size={30} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{OWNER.name}</div>
              <div className="truncate text-xs text-muted-foreground">{OWNER.email}</div>
            </div>
            <span className="w-[164px] text-xs text-muted-foreground">소유자</span>
            <span className="w-7" />
          </li>
          {people.map((p) => (
            <li
              key={p.email}
              data-testid={`${T}-row-${p.email}`}
              className={cn(
                "group flex items-center gap-3 px-3 py-2 transition-colors duration-700",
                flash === p.email && "bg-emerald-50 dark:bg-emerald-950/40",
              )}
            >
              <Avatar person={p} size={30} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{p.name ?? p.email}</span>
                  {!p.memberId && (
                    <span className="rounded bg-violet-100 px-1 text-[10px] font-medium text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                      초대
                    </span>
                  )}
                </div>
                {p.memberId && <div className="truncate text-xs text-muted-foreground">{p.email}</div>}
              </div>
              <div className="w-[164px]">
                <Segmented
                  size="sm"
                  value={p.permission}
                  options={PERM_OPTS}
                  onChange={(v) => setPerm(p.email, v)}
                  testId={`${T}-row-${p.email}-perm`}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  remove(p.email)
                  setRemoved(p)
                }}
                data-testid={`${T}-row-${p.email}-remove`}
                title="제거"
                className="grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {removed && (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/60 px-3 py-1.5 text-xs">
          <span className="flex-1 truncate text-muted-foreground">{removed.name ?? removed.email} 제거됨</span>
          <button
            type="button"
            onClick={() => {
              add([removed], removed.permission)
              setRemoved(null)
            }}
            data-testid={`${T}-undo-remove`}
            className="font-medium text-foreground hover:underline"
          >
            되돌리기
          </button>
        </div>
      )}
    </div>
  )
}

function LinksTab({ links, setLinks }: { links: ShareLink[]; setLinks: React.Dispatch<React.SetStateAction<ShareLink[]>> }) {
  const [perm, setPerm] = useState<LinkPerm>("read")
  const [days, setDays] = useState<number | null>(7)
  const [usePw, setUsePw] = useState(false)
  const [pw, setPw] = useState("")
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { copied, copy } = useCopied()

  const canCreate = !usePw || pw.length >= 4

  function create() {
    if (!canCreate) return
    setLinks((l) => [newLink({ permission: perm, expiryDays: days, hasPassword: usePw }), ...l])
    setPw("")
    setUsePw(false)
  }

  function revoke(id: string) {
    if (confirmId !== id) {
      setConfirmId(id)
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      confirmTimer.current = setTimeout(() => setConfirmId(null), 3000)
      return
    }
    setLinks((l) => l.filter((x) => x.id !== id))
    setConfirmId(null)
  }

  return (
    <div className="px-5 pt-4 pb-4">
      <div className="rounded-lg border bg-muted/30">
        <div className="grid grid-cols-[72px_1fr] items-center gap-x-3 gap-y-3 p-4">
          <span className="text-xs font-medium text-muted-foreground">권한</span>
          <Segmented
            value={perm}
            options={[
              { value: "read", label: "보기" },
              { value: "write", label: "편집" },
            ]}
            onChange={setPerm}
            testId={`${T}-new-perm`}
            icons
          />
          <span className="text-xs font-medium text-muted-foreground">만료</span>
          <Segmented
            value={String(days) as string}
            options={EXPIRY_OPTIONS.map((o) => ({ value: String(o.days), label: o.label }))}
            onChange={(v) => setDays(v === "null" ? null : Number(v))}
            testId={`${T}-new-expiry`}
          />
          <span className="text-xs font-medium text-muted-foreground">비밀번호</span>
          <div className="flex h-8 items-center gap-3">
            <Switch checked={usePw} onChange={setUsePw} testId={`${T}-new-password-toggle`} />
            {usePw && (
              <input
                type="password"
                value={pw}
                autoFocus
                onChange={(e) => setPw(e.target.value)}
                placeholder="4자 이상"
                data-testid={`${T}-new-password-input`}
                className="h-8 w-48 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
              />
            )}
          </div>
        </div>
        <div className="flex items-center justify-end border-t px-4 py-2.5">
          <button
            type="button"
            onClick={create}
            disabled={!canCreate}
            data-testid={`${T}-new-create`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus size={15} />새 링크
          </button>
        </div>
      </div>

      <h3 className="mt-5 mb-2 text-xs font-medium text-muted-foreground">활성 링크</h3>
      {links.length === 0 ? (
        <div className="grid h-20 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">
          링크 없음
        </div>
      ) : (
        <ul className="max-h-[220px] space-y-2 overflow-y-auto">
          {links.map((l) => (
            <li key={l.id} data-testid={`${T}-link-${l.id}`} className="rounded-lg border px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Link2 size={15} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{shortUrl(l.url)}</span>
                <button
                  type="button"
                  onClick={() => copy(l.url, l.id)}
                  data-testid={`${T}-link-${l.id}-copy`}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                    copied === l.id
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                      : "hover:bg-muted",
                  )}
                >
                  {copied === l.id ? <Check size={13} /> : <Copy size={13} />}
                  {copied === l.id ? "복사됨" : "복사"}
                </button>
                <button
                  type="button"
                  onClick={() => revoke(l.id)}
                  data-testid={`${T}-link-${l.id}-revoke`}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors",
                    confirmId === l.id
                      ? "bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-600"
                      : "text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400",
                  )}
                >
                  <Trash2 size={13} />
                  {confirmId === l.id ? "철회 확인" : "철회"}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[23px]">
                <Badge>{l.permission === "read" ? "보기" : "편집"}</Badge>
                <Badge>
                  <CalendarClock size={11} />
                  {expiryDate(l.expiryDays)}
                </Badge>
                {l.hasPassword && (
                  <Badge tone="amber">
                    <Lock size={11} />
                    비밀번호
                  </Badge>
                )}
                <Badge>
                  <Download size={11} />
                  {l.downloads}회
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "amber" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11px] font-medium",
        tone === "amber"
          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
          : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  )
}
