"use client"

import { useState } from "react"
import { Check, ChevronDown, Copy, Download, Folder, Link2, Link2Off, RefreshCw, X } from "lucide-react"

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
  NODE_META,
  OWNER,
  PermMenu,
  PersonCombobox,
  QrPattern,
  Switch,
  expiryDate,
  newLink,
  shortUrl,
  useCopied,
  usePeople,
  type Perm,
  type ShareLink,
} from "./shared"

const T = "pg-share-dialog-c"

// 두 패널: 왼쪽 사람, 오른쪽 링크 카드
export function VariantC() {
  const { people, add, setPerm, remove } = usePeople()
  const [perm, setDefaultPerm] = useState<Perm>("read")
  const [link, setLink] = useState<ShareLink | null>(INITIAL_LINK)
  const [pwEditing, setPwEditing] = useState(false)
  const [pw, setPw] = useState("")
  const { copied, copy } = useCopied()

  const all = [OWNER, ...people]

  return (
    <div
      className="flex h-[480px] w-[720px] max-w-full rounded-xl border bg-background shadow-2xl"
      data-testid={`${T}-dialog`}
    >
      {/* 사람 */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2.5 px-5 pt-4 pb-3">
          <Folder size={18} className="shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold leading-tight">{NODE.name}</h2>
            <p className="truncate text-xs text-muted-foreground">{NODE_META}</p>
          </div>
          <div className="flex -space-x-1.5">
            {all.slice(0, 4).map((p) => (
              <Avatar key={p.email} person={p} size={24} className="ring-2 ring-background" />
            ))}
            {all.length > 4 && (
              <span className="grid size-6 place-items-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-background">
                +{all.length - 4}
              </span>
            )}
          </div>
        </header>

        <div className="px-5">
          <PersonCombobox
            testId={`${T}-person`}
            exclude={all.map((p) => p.email)}
            onPick={(c) => add([c], perm)}
            className="h-10 pr-1"
            leading={null}
          />
          <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
            추가 권한
            <PermMenu
              value={perm}
              onChange={setDefaultPerm}
              testId={`${T}-default-perm`}
              align="start"
              className="h-6 px-1.5 text-xs font-medium text-foreground"
            />
          </div>
        </div>

        <ul className="mt-2 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <li className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <Avatar person={OWNER} size={28} />
            <span className="min-w-0 flex-1 truncate text-sm">
              {OWNER.name} <span className="text-muted-foreground">(나)</span>
            </span>
            <span className="px-2 text-xs text-muted-foreground">소유자</span>
          </li>
          {people.map((p) => (
            <li
              key={p.email}
              data-testid={`${T}-row-${p.email}`}
              className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/60"
            >
              <Avatar person={p} size={28} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{p.name ?? p.email}</div>
                <div className="truncate text-[11px] text-muted-foreground">{p.memberId ? p.email : "초대됨"}</div>
              </div>
              <PermMenu
                value={p.permission}
                onChange={(v) => setPerm(p.email, v)}
                testId={`${T}-row-${p.email}-perm`}
                className="h-7 text-xs"
              />
              <button
                type="button"
                onClick={() => remove(p.email)}
                data-testid={`${T}-row-${p.email}-remove`}
                title="제거"
                className="grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background hover:text-rose-600 focus-visible:opacity-100 dark:hover:text-rose-400"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* 링크 */}
      <section className="flex w-[272px] shrink-0 flex-col rounded-r-xl border-l bg-muted/40">
        <header className="flex items-center gap-2 px-4 pt-4 pb-3">
          <Link2 size={16} className="text-muted-foreground" />
          <h3 className="flex-1 text-sm font-medium">외부 링크</h3>
          <Switch
            checked={!!link}
            onChange={(v) => setLink(v ? newLink() : null)}
            testId={`${T}-link-toggle`}
          />
          <button
            type="button"
            data-testid={`${T}-close`}
            className="-mr-1 ml-1 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <X size={16} />
          </button>
        </header>

        {link ? (
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
            <div className="rounded-lg border bg-background p-3">
              <div className="mx-auto w-fit rounded-md p-1">
                <QrPattern seed={link.id} size={108} />
              </div>
              <div className="mt-2 truncate text-center font-mono text-[11px] text-muted-foreground">
                {shortUrl(link.url)}
              </div>
              <button
                type="button"
                onClick={() => copy(link.url)}
                data-testid={`${T}-link-copy`}
                className={cn(
                  "mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors",
                  copied
                    ? "bg-emerald-600 text-white dark:bg-emerald-600"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {copied ? <Check size={15} /> : <Copy size={14} />}
                {copied ? "복사됨" : "링크 복사"}
              </button>
            </div>

            <div className="mt-3 divide-y rounded-lg border bg-background text-sm">
              <Row label="만료">
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      data-testid={`${T}-link-expiry-trigger`}
                      className="-mr-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-foreground/80 hover:bg-muted data-[state=open]:bg-muted"
                    >
                      {link.expiryDays == null ? "없음" : expiryDate(link.expiryDays).replace(" 만료", "")}
                      <ChevronDown size={13} className="text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    {EXPIRY_OPTIONS.map((o) => (
                      <DropdownMenuItem
                        key={o.label}
                        onSelect={() => setLink({ ...link, expiryDays: o.days })}
                        data-testid={`${T}-link-expiry-${o.days ?? "none"}`}
                        className="py-1.5"
                      >
                        <span className="flex-1">{o.label}</span>
                        {link.expiryDays === o.days && <Check />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </Row>
              <div>
                <Row label="비밀번호">
                  <Switch
                    checked={link.hasPassword || pwEditing}
                    onChange={(v) => {
                      if (v) setPwEditing(true)
                      else {
                        setPwEditing(false)
                        setPw("")
                        setLink({ ...link, hasPassword: false })
                      }
                    }}
                    testId={`${T}-link-password-toggle`}
                  />
                </Row>
                {pwEditing && !link.hasPassword && (
                  <form
                    className="flex gap-1.5 px-3 pb-2.5"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (pw.length < 4) return
                      setLink({ ...link, hasPassword: true })
                      setPwEditing(false)
                      setPw("")
                    }}
                  >
                    <input
                      type="password"
                      value={pw}
                      autoFocus
                      onChange={(e) => setPw(e.target.value)}
                      placeholder="4자 이상"
                      data-testid={`${T}-link-password-input`}
                      className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
                    />
                    <button
                      type="submit"
                      disabled={pw.length < 4}
                      data-testid={`${T}-link-password-save`}
                      className="h-7 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                    >
                      설정
                    </button>
                  </form>
                )}
              </div>
            </div>

            <div className="mt-auto flex items-center gap-2 pt-3 text-xs text-muted-foreground">
              <Download size={13} />
              <span className="flex-1">다운로드 {link.downloads}회</span>
              <button
                type="button"
                onClick={() => setLink(newLink({ permission: link.permission, expiryDays: link.expiryDays }))}
                data-testid={`${T}-link-regenerate`}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 hover:bg-background hover:text-foreground"
              >
                <RefreshCw size={12} />
                재발급
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 pb-10">
            <span className="grid size-12 place-items-center rounded-full bg-background text-muted-foreground ring-1 ring-border">
              <Link2Off size={20} />
            </span>
            <span className="text-sm text-muted-foreground">링크 없음</span>
            <button
              type="button"
              onClick={() => setLink(newLink())}
              data-testid={`${T}-link-create`}
              className="h-8 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted"
            >
              링크 만들기
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-10 items-center justify-between px-3">
      <span className="text-[13px]">{label}</span>
      {children}
    </div>
  )
}
