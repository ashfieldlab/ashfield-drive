"use client"

import { useMemo, useState, type ReactNode } from "react"
import {
  ArrowDownUp,
  Check,
  ChevronRight,
  Download,
  FileArchive,
  FileAudio,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Folder,
  FolderInput,
  FolderLock,
  FolderOpen,
  FolderPlus,
  FolderUp,
  History,
  Image as ImageIcon,
  Link2,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Presentation,
  Share2,
  Star,
  Trash2,
  Upload,
  Users,
  X,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  MEMBERS,
  NODES,
  QUOTA,
  formatBytes,
  type MockKind,
  type MockMember,
  type MockNode,
} from "../_mock"

export const T = "pg-files-page"

// 종류별 아이콘과 색
export const KIND: Record<MockKind, { icon: LucideIcon; label: string; fg: string; bg: string }> = {
  folder: { icon: Folder, label: "폴더", fg: "text-sky-600 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-950/50" },
  image: { icon: ImageIcon, label: "이미지", fg: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/50" },
  pdf: { icon: FileText, label: "PDF", fg: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-950/50" },
  doc: { icon: FileText, label: "문서", fg: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/50" },
  sheet: { icon: FileSpreadsheet, label: "스프레드시트", fg: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/50" },
  slide: { icon: Presentation, label: "프레젠테이션", fg: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/50" },
  video: { icon: FileVideo, label: "동영상", fg: "text-pink-600 dark:text-pink-400", bg: "bg-pink-50 dark:bg-pink-950/50" },
  audio: { icon: FileAudio, label: "오디오", fg: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-950/50" },
  archive: { icon: FileArchive, label: "압축 파일", fg: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/50" },
  code: { icon: FileCode, label: "코드", fg: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-950/50" },
  text: { icon: FileType, label: "텍스트", fg: "text-muted-foreground", bg: "bg-muted" },
}

export function KindIcon({ node, className, strokeWidth }: { node: MockNode; className?: string; strokeWidth?: number }) {
  if (node.kind === "folder" && node.vault) return <FolderLock className={className} strokeWidth={strokeWidth} />
  const Icon = KIND[node.kind].icon
  return <Icon className={className} strokeWidth={strokeWidth} />
}

/** 종류 아이콘. 이미지는 썸네일을 보여준다 */
export function FileGlyph({ node, className, iconClassName, plain }: { node: MockNode; className?: string; iconClassName?: string; plain?: boolean }) {
  const meta = KIND[node.kind]
  if (node.thumb) {
    return <span className={cn("block shrink-0 rounded-md ring-1 ring-foreground/10", className)} style={{ background: node.thumb }} />
  }
  if (plain) return <KindIcon node={node} className={cn("shrink-0", meta.fg, iconClassName)} />
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-md", meta.bg, meta.fg, className)}>
      <KindIcon node={node} className={cn("size-4", iconClassName)} />
    </span>
  )
}

export function Avatar({ member, className }: { member: MockMember; className?: string }) {
  return (
    <span
      title={member.name}
      className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold", className)}
      style={{ background: member.color, color: "#fff" }}
    >
      {member.name.slice(0, 1)}
    </span>
  )
}

/** 공유받은 사람 (가짜): 앞에서부터 n 명 */
export function sharedMembers(n: MockNode): MockMember[] {
  return MEMBERS.slice(1, 1 + n.sharedWith)
}

export function AvatarStack({ members, max = 3, className, ring = "ring-background" }: { members: MockMember[]; max?: number; className?: string; ring?: string }) {
  if (members.length === 0) return null
  const shown = members.slice(0, max)
  const rest = members.length - shown.length
  return (
    <span className={cn("flex items-center -space-x-1.5", className)}>
      {shown.map((m) => (
        <Avatar key={m.id} member={m} className={cn("size-5 text-[9px] ring-2", ring)} />
      ))}
      {rest > 0 && (
        <span className={cn("inline-flex size-5 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground ring-2", ring)}>
          +{rest}
        </span>
      )}
    </span>
  )
}

/** 즐겨찾기, 보안, 공유, 링크 표시 */
export function Badges({ node, className }: { node: MockNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-muted-foreground", className)}>
      {node.starred && <Star aria-label="즐겨찾기" className="size-3.5 fill-amber-400 text-amber-400" />}
      {node.vault && <Lock aria-label="보안 폴더" className="size-3.5 text-emerald-600 dark:text-emerald-400" />}
      {node.sharedWith > 0 && <Users aria-label="공유 중" className="size-3.5" />}
      {node.hasLink && <Link2 aria-label="링크 공유" className="size-3.5" />}
    </span>
  )
}

// 정렬, 필터

export type SortKey = "name" | "size" | "updatedAt"
export interface Sort {
  key: SortKey
  dir: "asc" | "desc"
}
export const SORT_LABEL: Record<SortKey, string> = { name: "이름", size: "크기", updatedAt: "수정한 날짜" }

export type TypeFilter = "all" | "folder" | "doc" | "image" | "media"
const FILTER_KINDS: Record<Exclude<TypeFilter, "all">, MockKind[]> = {
  folder: ["folder"],
  doc: ["doc", "pdf", "sheet", "slide", "text", "code"],
  image: ["image"],
  media: ["video", "audio"],
}
export const FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "folder", label: "폴더" },
  { key: "doc", label: "문서" },
  { key: "image", label: "이미지" },
  { key: "media", label: "미디어" },
]

function matches(n: MockNode, f: TypeFilter) {
  return f === "all" || FILTER_KINDS[f].includes(n.kind)
}

function sortNodes(list: MockNode[], s: Sort) {
  const sign = s.dir === "asc" ? 1 : -1
  return [...list].sort((a, b) => {
    if ((a.kind === "folder") !== (b.kind === "folder")) return a.kind === "folder" ? -1 : 1
    if (s.key === "name") return a.name.localeCompare(b.name, "ko") * sign
    if (s.key === "size") return (a.size - b.size) * sign
    return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * sign
  })
}

export type RowAction = "open" | "download" | "rename" | "move" | "share" | "versions" | "star" | "delete"

const ACTION_LABEL: Record<RowAction, string> = {
  open: "열기",
  download: "다운로드",
  rename: "이름 변경",
  move: "이동",
  share: "공유",
  versions: "버전 기록",
  star: "즐겨찾기",
  delete: "삭제",
}

/** 화면 상태: 현재 폴더, 정렬, 필터, 선택, 이름 변경 */
export function useDrive() {
  const [nodes, setNodes] = useState<MockNode[]>(NODES)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>({ key: "name", dir: "asc" })
  const [filter, setFilter] = useState<TypeFilter>("all")
  const [selected, setSelected] = useState<string[]>([])
  const [renamingId, setRenamingId] = useState<string | null>(null)

  const childrenOf = (parentId: string | null) =>
    sortNodes(
      nodes.filter((n) => n.parentId === parentId && matches(n, filter)),
      sort,
    )

  const items = useMemo(
    () => sortNodes(nodes.filter((n) => n.parentId === folderId && matches(n, filter)), sort),
    [nodes, folderId, filter, sort],
  )

  const path = useMemo(() => {
    const out: MockNode[] = []
    let cur = nodes.find((n) => n.id === folderId)
    while (cur) {
      out.unshift(cur)
      const pid: string | null = cur.parentId
      cur = nodes.find((n) => n.id === pid)
    }
    return out
  }, [nodes, folderId])

  function open(id: string | null) {
    setFolderId(id)
    setSelected([])
    setRenamingId(null)
  }

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  function toggleAll() {
    setSelected((s) => (s.length === items.length && items.length > 0 ? [] : items.map((n) => n.id)))
  }

  function remove(ids: string[]) {
    setNodes((ns) => ns.filter((n) => !ids.includes(n.id)))
    setSelected((s) => s.filter((x) => !ids.includes(x)))
    toast(ids.length > 1 ? `${ids.length}개 항목을 휴지통으로 옮김` : "휴지통으로 옮김")
  }

  function rename(id: string, name: string) {
    const v = name.trim()
    if (v) setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, name: v } : n)))
    setRenamingId(null)
  }

  function createFolder() {
    const id = `new-${Date.now()}`
    const node: MockNode = {
      id,
      name: "새 폴더",
      kind: "folder",
      parentId: folderId,
      size: 0,
      count: 0,
      updatedAt: new Date("2026-10-10T16:59:00+09:00").toISOString(),
      owner: "u1",
      sharedWith: 0,
    }
    setNodes((ns) => [node, ...ns])
    setRenamingId(id)
  }

  function act(action: RowAction, node: MockNode) {
    if (action === "open") {
      if (node.kind === "folder") open(node.id)
      else toast(`미리보기: ${node.name}`)
    } else if (action === "rename") setRenamingId(node.id)
    else if (action === "star") setNodes((ns) => ns.map((n) => (n.id === node.id ? { ...n, starred: !n.starred } : n)))
    else if (action === "delete") remove([node.id])
    else toast(`${ACTION_LABEL[action]}: ${node.name}`)
  }

  function bulk(action: "download" | "move" | "share" | "delete") {
    if (action === "delete") remove(selected)
    else toast(`${ACTION_LABEL[action]}: ${selected.length}개 항목`)
  }

  const folderNode = path[path.length - 1] ?? null
  return {
    nodes,
    folderId,
    folderNode,
    items,
    path,
    sort,
    setSort,
    filter,
    setFilter,
    selected,
    setSelected,
    renamingId,
    setRenamingId,
    childrenOf,
    open,
    toggle,
    toggleAll,
    rename,
    createFolder,
    act,
    bulk,
  }
}

export type Drive = ReturnType<typeof useDrive>

// 공용 조각

export function RenameInput({ node, onDone, className }: { node: MockNode; onDone: (name: string) => void; className?: string }) {
  const [v, setV] = useState(node.name)
  return (
    <input
      data-testid={`${T}-rename-input`}
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => {
        const dot = node.kind === "folder" ? -1 : e.target.value.lastIndexOf(".")
        e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length)
      }}
      onBlur={() => onDone(v)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Enter") onDone(v)
        if (e.key === "Escape") onDone(node.name)
      }}
      className={cn(
        "h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    />
  )
}

/** 행 메뉴: 아이콘 나열 대신 하나의 메뉴 */
export function RowMenu({
  node,
  onAction,
  trigger,
  align = "end",
  open,
  onOpenChange,
}: {
  node: MockNode
  onAction: (a: RowAction, n: MockNode) => void
  trigger?: ReactNode
  align?: "start" | "end"
  open?: boolean
  onOpenChange?: (o: boolean) => void
}) {
  const isFolder = node.kind === "folder"
  const item = (a: RowAction, Icon: LucideIcon, label = ACTION_LABEL[a]) => (
    <DropdownMenuItem data-testid={`${T}-menu-${a}`} onSelect={() => onAction(a, node)}>
      <Icon />
      {label}
    </DropdownMenuItem>
  )
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button
            data-testid={`${T}-row-menu-${node.id}`}
            variant="ghost"
            size="icon-sm"
            aria-label="더 보기"
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground"
          >
            <MoreHorizontal />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48" onClick={(e) => e.stopPropagation()}>
        {item("open", isFolder ? FolderOpen : FileText)}
        {item("download", Download)}
        <DropdownMenuSeparator />
        {item("share", Share2)}
        {item("rename", Pencil)}
        {item("move", FolderInput)}
        {!isFolder && item("versions", History)}
        {item("star", Star, node.starred ? "즐겨찾기 해제" : "즐겨찾기")}
        <DropdownMenuSeparator />
        <DropdownMenuItem data-testid={`${T}-menu-delete`} variant="destructive" onSelect={() => onAction("delete", node)}>
          <Trash2 />
          삭제
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function NewMenu({ drive, align = "end", className }: { drive: Drive; align?: "start" | "end"; className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button data-testid={`${T}-new`} className={className}>
          <Plus />
          새로 만들기
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-44">
        <DropdownMenuItem data-testid={`${T}-new-folder`} onSelect={() => drive.createFolder()}>
          <FolderPlus />
          새 폴더
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem data-testid={`${T}-upload-file`} onSelect={() => toast("파일 선택")}>
          <Upload />
          파일 업로드
        </DropdownMenuItem>
        <DropdownMenuItem data-testid={`${T}-upload-folder`} onSelect={() => toast("폴더 선택")}>
          <FolderUp />
          폴더 업로드
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function SortMenu({ drive, className }: { drive: Drive; className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button data-testid={`${T}-sort`} variant="ghost" size="sm" className={cn("text-muted-foreground", className)}>
          <ArrowDownUp />
          {SORT_LABEL[drive.sort.key]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>정렬</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={drive.sort.key} onValueChange={(k) => drive.setSort((s) => ({ ...s, key: k as SortKey }))}>
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <DropdownMenuRadioItem key={k} value={k} data-testid={`${T}-sort-${k}`}>
              {SORT_LABEL[k]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={drive.sort.dir} onValueChange={(d) => drive.setSort((s) => ({ ...s, dir: d as Sort["dir"] }))}>
          <DropdownMenuRadioItem value="asc" data-testid={`${T}-sort-asc`}>
            오름차순
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="desc" data-testid={`${T}-sort-desc`}>
            내림차순
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 종류 필터: 밑줄 탭 또는 알약 */
export function FilterTabs({ drive, look = "pill", className }: { drive: Drive; look?: "pill" | "segment"; className?: string }) {
  return (
    <div className={cn("flex items-center", look === "segment" ? "gap-0.5 rounded-lg bg-muted p-0.5" : "gap-1.5", className)}>
      {FILTERS.map((f) => {
        const on = drive.filter === f.key
        return (
          <button
            key={f.key}
            type="button"
            data-testid={`${T}-filter-${f.key}`}
            onClick={() => {
              drive.setFilter(f.key)
              drive.setSelected([])
            }}
            className={cn(
              "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
              look === "segment"
                ? on
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                : on
                  ? "bg-foreground text-background"
                  : "border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        )
      })}
    </div>
  )
}

export function Breadcrumb({ drive, className, big }: { drive: Drive; className?: string; big?: boolean }) {
  const crumbs = [{ id: null as string | null, name: "내 파일" }, ...drive.path.map((n) => ({ id: n.id as string | null, name: n.name }))]
  return (
    <nav className={cn("flex min-w-0 items-center gap-0.5", big ? "text-xl font-semibold tracking-tight" : "text-sm", className)}>
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1
        return (
          <span key={c.id ?? "root"} className="flex min-w-0 items-center gap-0.5">
            {i > 0 && <ChevronRight className={cn("shrink-0 text-muted-foreground/60", big ? "size-5" : "size-4")} />}
            <button
              type="button"
              data-testid={`${T}-crumb-${c.id ?? "root"}`}
              onClick={() => drive.open(c.id)}
              disabled={last}
              className={cn(
                "truncate rounded-md px-1.5 py-0.5 transition-colors",
                last ? "text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {c.name}
            </button>
          </span>
        )
      })}
    </nav>
  )
}

export function Checkbox({ checked, indeterminate, onChange, testid, className }: { checked: boolean; indeterminate?: boolean; onChange: () => void; testid: string; className?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      data-testid={testid}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        checked || indeterminate ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:border-foreground/40",
        className,
      )}
    >
      {checked && <Check className="size-3" strokeWidth={3} />}
      {!checked && indeterminate && <span className="h-0.5 w-2 rounded-full bg-current" />}
    </button>
  )
}

/** 여러 개 선택했을 때 뜨는 막대 */
export function BulkBar({ drive, className }: { drive: Drive; className?: string }) {
  const n = drive.selected.length
  if (n === 0) return null
  const btn = (a: "download" | "move" | "share" | "delete", Icon: LucideIcon, label: string) => (
    <Button
      data-testid={`${T}-bulk-${a}`}
      variant="ghost"
      size="sm"
      onClick={() => drive.bulk(a)}
      className={cn(
        "text-background hover:bg-background/15 hover:text-background dark:hover:bg-background/15",
        a === "delete" && "text-rose-300 hover:text-rose-200 dark:text-rose-600 dark:hover:text-rose-700",
      )}
    >
      <Icon />
      {label}
    </Button>
  )
  return (
    <div className={cn("flex items-center gap-1 rounded-xl bg-foreground py-1 pr-1 pl-3 text-background shadow-lg", className)}>
      <span className="mr-2 text-sm font-medium tabular-nums">{n}개 선택</span>
      <span className="mr-1 h-4 w-px bg-background/20" />
      {btn("download", Download, "다운로드")}
      {btn("move", FolderInput, "이동")}
      {btn("share", Share2, "공유")}
      {btn("delete", Trash2, "삭제")}
      <Button
        data-testid={`${T}-bulk-clear`}
        variant="ghost"
        size="icon-sm"
        aria-label="선택 해제"
        onClick={() => drive.setSelected([])}
        className="ml-1 text-background/70 hover:bg-background/15 hover:text-background dark:hover:bg-background/15"
      >
        <X />
      </Button>
    </div>
  )
}

export const quotaPct = Math.round((QUOTA.used / QUOTA.total) * 100)

export function QuotaBar({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5 text-xs text-muted-foreground", className)}>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${quotaPct}%` }} />
      </div>
      <span className="tabular-nums">
        {formatBytes(QUOTA.used)} / {formatBytes(QUOTA.total)}
      </span>
    </div>
  )
}

export function EmptyFolder({ node, className }: { node: MockNode | null; className?: string }) {
  const Icon = node?.vault ? FolderLock : Folder
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-16 text-sm text-muted-foreground", className)}>
      <Icon className="size-8 text-muted-foreground/50" strokeWidth={1.5} />
      {node?.vault ? "잠긴 폴더" : "빈 폴더"}
    </div>
  )
}
