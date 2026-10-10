"use client"

import { useState } from "react"
import { ArrowDown, ArrowUp, Copy, Download, Share2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ACTIVITY, QUOTA, formatBytes, memberOf, relativeTime, type MockNode } from "../_mock"
import {
  Avatar,
  AvatarStack,
  Badges,
  Breadcrumb,
  BulkBar,
  Checkbox,
  EmptyFolder,
  FileGlyph,
  FilterTabs,
  KIND,
  NewMenu,
  RenameInput,
  RowMenu,
  T,
  KindIcon,
  quotaPct,
  sharedMembers,
  useDrive,
  type Drive,
  type SortKey,
} from "./shared"

const COLS = "grid-cols-[1.25rem_minmax(0,1fr)_4.5rem_5rem_5.5rem_2rem]"

// 목록 + 상세 패널
export function VariantA() {
  const drive = useDrive()
  const [activeId, setActiveId] = useState<string | null>("n-plan")
  const active = activeNode(drive, activeId)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <Breadcrumb drive={drive} big className="-ml-1.5" />
        <NewMenu drive={drive} />
      </div>
      <FilesToolbar drive={drive} />
      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1">
          <ListTable drive={drive} activeId={active?.id ?? null} onActivate={setActiveId} />
        </div>
        <DetailPanel drive={drive} active={active} onClose={() => setActiveId(null)} />
      </div>
    </div>
  )
}

export function activeNode(drive: Drive, id: string | null): MockNode | null {
  return drive.nodes.find((n) => n.id === id && n.parentId === drive.folderId) ?? null
}

/** 필터 또는 선택 시 일괄 작업 바. 목록과 패널 위 전체 너비 */
export function FilesToolbar({ drive, children }: { drive: Drive; children?: React.ReactNode }) {
  return (
    <div className="sticky -top-6 z-10 -mx-1 mb-3 flex h-11 items-center justify-between gap-3 bg-background/90 px-1 backdrop-blur">
      {drive.selected.length > 0 ? (
        <BulkBar drive={drive} />
      ) : (
        <>
          <FilterTabs drive={drive} look="segment" />
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground tabular-nums">{drive.items.length}개 항목</span>
            {children}
          </div>
        </>
      )}
    </div>
  )
}

export function ListTable({ drive, activeId, onActivate }: { drive: Drive; activeId: string | null; onActivate: (id: string) => void }) {
  const all = drive.items.length > 0 && drive.selected.length === drive.items.length
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className={cn("grid items-center gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground", COLS)}>
        <Checkbox
          testid={`${T}-select-all`}
          checked={all}
          indeterminate={drive.selected.length > 0}
          onChange={drive.toggleAll}
        />
        <SortHead drive={drive} k="name" label="이름" />
        <span>공유</span>
        <SortHead drive={drive} k="size" label="크기" right />
        <SortHead drive={drive} k="updatedAt" label="수정" right />
        <span />
      </div>

      {drive.items.length === 0 && <EmptyFolder node={drive.folderNode} />}

      {drive.items.map((n) => (
        <Row
          key={n.id}
          node={n}
          drive={drive}
          active={activeId === n.id}
          onClick={() => (n.kind === "folder" ? drive.open(n.id) : onActivate(n.id))}
        />
      ))}
    </div>
  )
}

export function DetailPanel({ drive, active, onClose }: { drive: Drive; active: MockNode | null; onClose: () => void }) {
  return (
    <aside className="sticky top-8 w-80 shrink-0 overflow-hidden rounded-xl border bg-card">
      {active ? <FileDetails node={active} drive={drive} onClose={onClose} /> : <FolderSummary drive={drive} />}
    </aside>
  )
}

function SortHead({ drive, k, label, right }: { drive: Drive; k: SortKey; label: string; right?: boolean }) {
  const on = drive.sort.key === k
  const Arrow = drive.sort.dir === "asc" ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      data-testid={`${T}-sorthead-${k}`}
      onClick={() => drive.setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }))}
      className={cn("flex items-center gap-1 hover:text-foreground", right && "justify-end", on && "text-foreground")}
    >
      {label}
      {on && <Arrow className="size-3" />}
    </button>
  )
}

function Row({ node, drive, active, onClick }: { node: MockNode; drive: Drive; active: boolean; onClick: () => void }) {
  const checked = drive.selected.includes(node.id)
  const renaming = drive.renamingId === node.id
  return (
    <div
      data-testid={`${T}-row-${node.id}`}
      onClick={onClick}
      className={cn(
        "group grid h-12 cursor-default items-center gap-3 border-b px-4 text-sm transition-colors last:border-b-0",
        COLS,
        checked ? "bg-primary/[0.06]" : active ? "bg-muted" : "hover:bg-muted/50",
      )}
    >
      <Checkbox
        testid={`${T}-check-${node.id}`}
        checked={checked}
        onChange={() => drive.toggle(node.id)}
        className={cn(!checked && drive.selected.length === 0 && "opacity-0 group-hover:opacity-100")}
      />
      <div className="flex min-w-0 items-center gap-3">
        <FileGlyph node={node} className="size-8" />
        {renaming ? (
          <RenameInput node={node} onDone={(v) => drive.rename(node.id, v)} />
        ) : (
          <>
            <span className="truncate font-medium">{node.name}</span>
            <Badges node={node} className="shrink-0" />
          </>
        )}
      </div>
      <div>
        <AvatarStack members={sharedMembers(node)} max={2} ring={active ? "ring-muted" : "ring-card"} />
      </div>
      <span className="text-right text-muted-foreground tabular-nums">
        {node.kind === "folder" ? `${node.count ?? 0}개` : formatBytes(node.size)}
      </span>
      <span className="text-right text-muted-foreground">{relativeTime(node.updatedAt)}</span>
      <div className="flex justify-end opacity-0 group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
        <RowMenu node={node} onAction={drive.act} />
      </div>
    </div>
  )
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-t px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function FileDetails({ node, drive, onClose }: { node: MockNode; drive: Drive; onClose: () => void }) {
  const meta = KIND[node.kind]
  const owner = memberOf(node.owner)
  const people = sharedMembers(node)
  const acts = ACTIVITY.filter((a) => a.target === node.name).slice(0, 4)
  const where = ["내 파일", ...drive.path.map((p) => p.name)].join(" / ")

  return (
    <div>
      <div className="p-3">
        <div
          className={cn("relative flex aspect-[16/10] items-center justify-center rounded-lg", !node.thumb && meta.bg)}
          style={node.thumb ? { background: node.thumb } : undefined}
        >
          {!node.thumb && <KindIcon node={node} className={cn("size-14", meta.fg)} strokeWidth={1.25} />}
          <span className="absolute top-2 left-2 rounded-md bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-foreground backdrop-blur">
            {meta.label}
          </span>
        </div>
      </div>
      <div className="px-4 pb-3">
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 flex-1 text-[15px] leading-snug font-semibold break-all">{node.name}</h2>
          <RowMenu node={node} onAction={(a, n) => (a === "delete" ? (drive.act(a, n), onClose()) : drive.act(a, n))} />
        </div>
        <div className="mt-3 flex gap-2">
          <Button data-testid={`${T}-detail-download`} size="sm" className="flex-1" onClick={() => drive.act("download", node)}>
            <Download />
            다운로드
          </Button>
          <Button data-testid={`${T}-detail-share`} size="sm" variant="outline" className="flex-1" onClick={() => drive.act("share", node)}>
            <Share2 />
            공유
          </Button>
        </div>
      </div>

      <Section title="정보">
        <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-y-2 text-sm">
          <dt className="text-muted-foreground">크기</dt>
          <dd className="tabular-nums">{formatBytes(node.size)}</dd>
          <dt className="text-muted-foreground">수정</dt>
          <dd>{relativeTime(node.updatedAt)}</dd>
          <dt className="text-muted-foreground">위치</dt>
          <dd className="truncate">{where}</dd>
          <dt className="text-muted-foreground">소유자</dt>
          <dd className="flex items-center gap-1.5">
            <Avatar member={owner} className="size-5 text-[9px]" />
            {owner.id === "u1" ? "나" : owner.name}
          </dd>
        </dl>
      </Section>

      <Section
        title="공유"
        aside={
          <Button data-testid={`${T}-detail-manage-share`} variant="ghost" size="xs" onClick={() => drive.act("share", node)}>
            관리
          </Button>
        }
      >
        {people.length === 0 && !node.hasLink ? (
          <p className="text-sm text-muted-foreground">나만 보기</p>
        ) : (
          <ul className="space-y-2">
            {people.map((m, i) => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <Avatar member={m} />
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                <span className="text-xs text-muted-foreground">{i === 0 ? "편집" : "보기"}</span>
              </li>
            ))}
            {node.hasLink && (
              <li className="flex items-center gap-2 rounded-lg bg-muted/60 py-1.5 pr-1 pl-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-muted-foreground">drive.ashfield.dev/s/k3Fq9x</span>
                <Button data-testid={`${T}-detail-copy-link`} variant="ghost" size="icon-xs" aria-label="링크 복사" onClick={() => toast("링크 복사됨")}>
                  <Copy />
                </Button>
              </li>
            )}
          </ul>
        )}
      </Section>

      {acts.length > 0 && (
        <Section title="활동">
          <ul className="space-y-2.5">
            {acts.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                <Avatar member={a.actor} className="size-5 text-[9px]" />
                <span className="min-w-0 flex-1 truncate">
                  {a.actor.id === "u1" ? "나" : a.actor.name}
                  <span className="text-muted-foreground"> {ACT_LABEL[a.action] ?? a.action}</span>
                </span>
                <span className="text-xs text-muted-foreground">{relativeTime(a.at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

const ACT_LABEL: Record<string, string> = {
  create: "생성",
  upload: "업로드",
  rename: "이름 변경",
  move: "이동",
  delete: "삭제",
  restore: "복원",
  share: "공유",
  unshare: "공유 해제",
  link: "링크 생성",
  version: "새 버전",
}

function FolderSummary({ drive }: { drive: Drive }) {
  const f = drive.folderNode
  const files = drive.items.filter((n) => n.kind !== "folder")
  const folders = drive.items.length - files.length
  const total = drive.items.reduce((s, n) => s + n.size, 0)
  return (
    <div>
      <div className="px-4 pt-4 pb-3">
        <h2 className="text-[15px] font-semibold">{f ? f.name : "내 파일"}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          폴더 {folders}, 파일 {files.length}, {formatBytes(total)}
        </p>
      </div>
      <Section title="저장 공간">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-2xl font-semibold tabular-nums">{formatBytes(QUOTA.used)}</span>
          <span className="text-xs text-muted-foreground tabular-nums">/ {formatBytes(QUOTA.total)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${quotaPct}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">{quotaPct}% 사용</p>
      </Section>
      <Section title="최근 활동">
        <ul className="space-y-2.5">
          {ACTIVITY.slice(0, 5).map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <Avatar member={a.actor} className="size-5 text-[9px]" />
              <span className="min-w-0 flex-1 truncate">{a.target}</span>
              <span className="text-xs text-muted-foreground">{relativeTime(a.at)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
