"use client"

import { useState } from "react"
import { CalendarClock, Check, ChevronDown, Download, Globe, Link2, Lock, RefreshCw, X } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import {
  Avatar,
  EXPIRY_OPTIONS,
  INITIAL_LINK,
  NODE,
  OWNER,
  PermMenu,
  PersonCombobox,
  expiryDate,
  newLink,
  shortUrl,
  useCopied,
  usePeople,
  type Candidate,
  type Perm,
  type ShareLink,
} from "./shared"

const T = "pg-share-dialog-a"

// 단일 열: 사람 입력 → 사람 목록 → 일반 액세스
export function VariantA() {
  const { people, add, setPerm, remove } = usePeople()
  const [staged, setStaged] = useState<Candidate[]>([])
  const [stagedPerm, setStagedPerm] = useState<Perm>("read")
  const [link, setLink] = useState<ShareLink | null>(INITIAL_LINK)
  const [pwOpen, setPwOpen] = useState(false)
  const [pw, setPw] = useState("")
  const { copied, copy } = useCopied()

  const exclude = [OWNER.email, ...people.map((p) => p.email), ...staged.map((s) => s.email)]

  function send() {
    add(staged, stagedPerm)
    setStaged([])
  }

  return (
    <div
      className="w-[560px] max-w-full rounded-xl border bg-background shadow-2xl"
      data-testid={`${T}-dialog`}
    >
      <div className="flex items-center gap-3 px-6 pt-5 pb-4">
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">&apos;{NODE.name}&apos; 공유</h2>
        <button
          type="button"
          data-testid={`${T}-close`}
          className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-6">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <PersonCombobox
              testId={`${T}-person`}
              exclude={exclude}
              onPick={(c) => setStaged((s) => [...s, c])}
              onBackspaceEmpty={() => setStaged((s) => s.slice(0, -1))}
              className="min-h-11 rounded-lg px-2.5"
              leading={staged.map((s) => (
                <span
                  key={s.email}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-muted/60 pr-1 pl-0.5 text-sm"
                >
                  <Avatar person={s} size={22} />
                  <span className="max-w-40 truncate">{s.name ?? s.email}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setStaged((x) => x.filter((y) => y.email !== s.email))
                    }}
                    data-testid={`${T}-staged-${s.email}-remove`}
                    className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            />
          </div>
          {staged.length > 0 && (
            <PermMenu
              value={stagedPerm}
              onChange={setStagedPerm}
              testId={`${T}-staged-perm`}
              className="h-11 border px-3"
            />
          )}
        </div>
      </div>

      {staged.length > 0 ? (
        <div className="flex items-center justify-end gap-2 px-6 pt-5 pb-5">
          <button
            type="button"
            onClick={() => setStaged([])}
            data-testid={`${T}-staged-cancel`}
            className="h-9 rounded-full px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            취소
          </button>
          <button
            type="button"
            onClick={send}
            data-testid={`${T}-staged-send`}
            className="h-9 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            공유 {staged.length}명
          </button>
        </div>
      ) : (
        <>
          <div className="px-6 pt-5">
            <h3 className="mb-1 text-sm font-medium">액세스 권한이 있는 사용자</h3>
            <ul className="-mx-2 max-h-64 overflow-y-auto">
              <li className="flex items-center gap-3 rounded-lg px-2 py-2">
                <Avatar person={OWNER} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{OWNER.name} (나)</div>
                  <div className="truncate text-xs text-muted-foreground">{OWNER.email}</div>
                </div>
                <span className="px-2 text-sm text-muted-foreground">소유자</span>
              </li>
              {people.map((p) => (
                <li
                  key={p.email}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50"
                  data-testid={`${T}-row-${p.email}`}
                >
                  <Avatar person={p} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name ?? p.email}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {p.memberId ? p.email : "초대됨"}
                    </div>
                  </div>
                  <PermMenu
                    value={p.permission}
                    onChange={(v) => setPerm(p.email, v)}
                    onRemove={() => remove(p.email)}
                    testId={`${T}-row-${p.email}-perm`}
                  />
                </li>
              ))}
            </ul>
          </div>

          <div className="px-6 pt-4 pb-1">
            <h3 className="mb-1 text-sm font-medium">일반 액세스</h3>
            <div className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2">
              <span
                className={cn(
                  "grid size-[34px] shrink-0 place-items-center rounded-full",
                  link
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {link ? <Globe size={17} /> : <Lock size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      data-testid={`${T}-access-trigger`}
                      className="-ml-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-sm font-medium hover:bg-muted data-[state=open]:bg-muted"
                    >
                      {link ? "링크가 있는 모든 사용자" : "제한됨"}
                      <ChevronDown size={14} className="text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuItem
                      onSelect={() => setLink(null)}
                      data-testid={`${T}-access-restricted`}
                      className="gap-2 py-1.5"
                    >
                      <Lock className="text-muted-foreground" />
                      <span className="flex-1">제한됨</span>
                      {!link && <Check />}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setLink((l) => l ?? newLink())}
                      data-testid={`${T}-access-link`}
                      className="gap-2 py-1.5"
                    >
                      <Globe className="text-muted-foreground" />
                      <span className="flex-1">링크가 있는 모든 사용자</span>
                      {link && <Check />}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {link && (
                  <div className="truncate pl-0 font-mono text-xs text-muted-foreground">
                    {shortUrl(link.url)}
                  </div>
                )}
              </div>
              {link && (
                <PermMenu
                  value={link.permission}
                  options={["read", "write"]}
                  onChange={(v) => setLink({ ...link, permission: v as "read" | "write" })}
                  testId={`${T}-link-perm`}
                />
              )}
            </div>

            {link && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 pb-1 pl-[46px]">
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      data-testid={`${T}-expiry-trigger`}
                      className={chip(link.expiryDays != null)}
                    >
                      <CalendarClock size={13} />
                      {expiryDate(link.expiryDays)}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-36">
                    {EXPIRY_OPTIONS.map((o) => (
                      <DropdownMenuItem
                        key={o.label}
                        onSelect={() => setLink({ ...link, expiryDays: o.days })}
                        data-testid={`${T}-expiry-${o.days ?? "none"}`}
                        className="py-1.5"
                      >
                        <span className="flex-1">{o.label}</span>
                        {link.expiryDays === o.days && <Check />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <button
                  type="button"
                  onClick={() => {
                    if (link.hasPassword) setLink({ ...link, hasPassword: false })
                    else setPwOpen((v) => !v)
                  }}
                  data-testid={`${T}-password-chip`}
                  className={chip(link.hasPassword)}
                >
                  <Lock size={13} />
                  {link.hasPassword ? "비밀번호 설정됨" : "비밀번호"}
                  {link.hasPassword && <X size={12} className="-mr-0.5 opacity-60" />}
                </button>

                <span className="inline-flex h-7 items-center gap-1.5 px-1.5 text-xs text-muted-foreground">
                  <Download size={13} />
                  {link.downloads}회
                </span>

                <button
                  type="button"
                  onClick={() => setLink(newLink({ permission: link.permission, expiryDays: link.expiryDays }))}
                  data-testid={`${T}-link-regenerate`}
                  title="새 링크로 교체"
                  className="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <RefreshCw size={14} />
                </button>

                {pwOpen && !link.hasPassword && (
                  <form
                    className="mt-1 flex w-full items-center gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (pw.length < 4) return
                      setLink({ ...link, hasPassword: true })
                      setPw("")
                      setPwOpen(false)
                    }}
                  >
                    <input
                      type="password"
                      value={pw}
                      autoFocus
                      onChange={(e) => setPw(e.target.value)}
                      placeholder="비밀번호 (4자 이상)"
                      data-testid={`${T}-password-input`}
                      className="h-8 flex-1 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
                    />
                    <button
                      type="submit"
                      disabled={pw.length < 4}
                      data-testid={`${T}-password-save`}
                      className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      설정
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-6 pt-4 pb-5">
            <button
              type="button"
              onClick={() => copy(link?.url ?? `https://drive.ashfield.dev/f/${NODE.id}`, "link")}
              data-testid={`${T}-copy-link`}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                copied
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "hover:bg-muted",
              )}
            >
              {copied ? <Check size={15} /> : <Link2 size={15} />}
              {copied ? "복사됨" : "링크 복사"}
            </button>
            <button
              type="button"
              data-testid={`${T}-done`}
              className="h-9 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              완료
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function chip(on: boolean) {
  return cn(
    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
    on
      ? "border-transparent bg-accent text-accent-foreground hover:bg-accent/80"
      : "border-dashed text-muted-foreground hover:bg-muted hover:text-foreground",
  )
}
