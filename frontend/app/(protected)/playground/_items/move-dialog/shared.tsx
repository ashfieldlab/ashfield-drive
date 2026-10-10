"use client"

import { useCallback, useMemo, useState } from "react"
import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  HardDrive,
  Presentation,
  Users,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

import { NODES, type MockKind, type MockNode } from "../_mock"

/** 이동 대상 위치 루트: 내 파일 또는 워크스페이스 */
export interface MoveRoot {
  id: string
  name: string
  kind: "mine" | "workspace"
  members?: number
  color?: string
}

export interface MoveFolder {
  id: string
  name: string
  /** null 이면 루트 바로 아래 */
  parentId: string | null
  rootId: string
  vault?: boolean
  shared?: boolean
}

export const ROOTS: MoveRoot[] = [
  { id: "mine", name: "내 파일", kind: "mine" },
  { id: "ws-mkt", name: "마케팅팀", kind: "workspace", members: 8, color: "#d97706" },
  { id: "ws-prod", name: "제품팀", kind: "workspace", members: 12, color: "#7c3aed" },
]

export const BASE_FOLDERS: MoveFolder[] = [
  { id: "f-design", name: "디자인", parentId: null, rootId: "mine", shared: true },
  { id: "f-design-draft", name: "시안", parentId: "f-design", rootId: "mine" },
  { id: "f-design-draft-2026", name: "2026", parentId: "f-design-draft", rootId: "mine" },
  { id: "f-design-draft-2025", name: "2025", parentId: "f-design-draft", rootId: "mine" },
  { id: "f-design-logo", name: "로고", parentId: "f-design", rootId: "mine" },
  { id: "f-contracts", name: "계약서", parentId: null, rootId: "mine", vault: true },
  { id: "f-contracts-2026", name: "2026", parentId: "f-contracts", rootId: "mine", vault: true },
  { id: "f-photos", name: "2026 워크숍 사진", parentId: null, rootId: "mine", shared: true },
  { id: "f-meeting", name: "회의록", parentId: null, rootId: "mine", shared: true },
  { id: "f-meeting-2026", name: "2026", parentId: "f-meeting", rootId: "mine" },
  { id: "f-meeting-2026-10", name: "10월", parentId: "f-meeting-2026", rootId: "mine" },
  { id: "f-meeting-2026-09", name: "9월", parentId: "f-meeting-2026", rootId: "mine" },
  { id: "f-meeting-2026-08", name: "8월", parentId: "f-meeting-2026", rootId: "mine" },
  { id: "f-meeting-2025", name: "2025", parentId: "f-meeting", rootId: "mine" },
  { id: "f-archive", name: "보관", parentId: null, rootId: "mine" },
  { id: "f-archive-2024", name: "2024", parentId: "f-archive", rootId: "mine" },
  { id: "f-archive-2023", name: "2023", parentId: "f-archive", rootId: "mine" },
  { id: "w-camp", name: "캠페인", parentId: null, rootId: "ws-mkt" },
  { id: "w-camp-fall", name: "2026 가을", parentId: "w-camp", rootId: "ws-mkt" },
  { id: "w-camp-spring", name: "2026 봄", parentId: "w-camp", rootId: "ws-mkt" },
  { id: "w-press", name: "보도자료", parentId: null, rootId: "ws-mkt" },
  { id: "w-brand", name: "브랜드", parentId: null, rootId: "ws-mkt" },
  { id: "w-plan", name: "기획", parentId: null, rootId: "ws-prod" },
  { id: "w-plan-2027", name: "2027", parentId: "w-plan", rootId: "ws-prod" },
  { id: "w-plan-2027-q1", name: "1분기", parentId: "w-plan-2027", rootId: "ws-prod" },
  { id: "w-research", name: "리서치", parentId: null, rootId: "ws-prod" },
  { id: "w-release", name: "릴리스 노트", parentId: null, rootId: "ws-prod" },
]

/** 옮기려는 항목: 내 파일 최상위의 문서 3개 */
export const MOVING: MockNode[] = ["n-plan", "n-budget", "n-deck"]
  .map((id) => NODES.find((n) => n.id === id))
  .filter((n): n is MockNode => !!n)

export const MOVING_TITLE = `${MOVING[0].name} 외 ${MOVING.length - 1}개`

/** 현재 위치: 내 파일 최상위. 위치 키는 루트면 rootId, 폴더면 폴더 id */
export const CURRENT_LOCATION = "mine"

export const RECENT_TARGETS = ["f-meeting-2026-10", "f-design-draft-2026", "w-plan-2027"]

const KIND_ICON: Record<MockKind, { icon: LucideIcon; cls: string }> = {
  folder: { icon: Folder, cls: "text-sky-600 dark:text-sky-400" },
  image: { icon: FileImage, cls: "text-violet-600 dark:text-violet-400" },
  pdf: { icon: FileText, cls: "text-rose-600 dark:text-rose-400" },
  doc: { icon: FileText, cls: "text-blue-600 dark:text-blue-400" },
  sheet: { icon: FileSpreadsheet, cls: "text-emerald-600 dark:text-emerald-400" },
  slide: { icon: Presentation, cls: "text-amber-600 dark:text-amber-400" },
  video: { icon: FileVideo, cls: "text-pink-600 dark:text-pink-400" },
  audio: { icon: FileAudio, cls: "text-teal-600 dark:text-teal-400" },
  archive: { icon: FileArchive, cls: "text-orange-600 dark:text-orange-400" },
  code: { icon: FileCode, cls: "text-slate-600 dark:text-slate-400" },
  text: { icon: File, cls: "text-muted-foreground" },
}

export function KindIcon({ kind, size = 16, className }: { kind: MockKind; size?: number; className?: string }) {
  const { icon: Icon, cls } = KIND_ICON[kind]
  return <Icon size={size} className={cn("shrink-0", cls, className)} />
}

export function RootIcon({ root, size = 16, className }: { root: MoveRoot; size?: number; className?: string }) {
  if (root.kind === "mine") return <HardDrive size={size} className={cn("shrink-0 text-muted-foreground", className)} />
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-md text-[10px] font-semibold text-white", className)}
      style={{ background: root.color, width: size + 2, height: size + 2 }}
    >
      {root.name[0]}
    </span>
  )
}

export function WorkspaceBadgeIcon({ size = 12 }: { size?: number }) {
  return <Users size={size} className="shrink-0" />
}

/** 폴더 트리 상태: 새 폴더를 만들 수 있어서 로컬 state 로 들고 있다 */
export function useFolders() {
  const [folders, setFolders] = useState<MoveFolder[]>(BASE_FOLDERS)

  const byId = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders])

  const childrenOf = useCallback(
    (rootId: string, parentId: string | null) =>
      folders
        .filter((f) => f.rootId === rootId && f.parentId === parentId)
        .sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true })),
    [folders],
  )

  /** 위치 키(루트 id 또는 폴더 id) 의 하위 폴더 */
  const childrenOfKey = useCallback(
    (key: string) => {
      const root = ROOTS.find((r) => r.id === key)
      if (root) return childrenOf(root.id, null)
      const f = byId.get(key)
      return f ? childrenOf(f.rootId, f.id) : []
    },
    [byId, childrenOf],
  )

  /** 루트부터 해당 위치까지 이름 목록 */
  const pathOf = useCallback(
    (key: string): string[] => {
      const root = ROOTS.find((r) => r.id === key)
      if (root) return [root.name]
      const out: string[] = []
      let cur = byId.get(key)
      const rootId = cur?.rootId
      while (cur) {
        out.unshift(cur.name)
        cur = cur.parentId ? byId.get(cur.parentId) : undefined
      }
      const r = ROOTS.find((x) => x.id === rootId)
      if (r) out.unshift(r.name)
      return out
    },
    [byId],
  )

  /** 루트부터 해당 위치까지 키 목록 */
  const keyPathOf = useCallback(
    (key: string): string[] => {
      if (ROOTS.some((r) => r.id === key)) return [key]
      const out: string[] = []
      let cur = byId.get(key)
      const rootId = cur?.rootId
      while (cur) {
        out.unshift(cur.id)
        cur = cur.parentId ? byId.get(cur.parentId) : undefined
      }
      if (rootId) out.unshift(rootId)
      return out
    },
    [byId],
  )

  const addFolder = useCallback(
    (parentKey: string, name: string): string => {
      const root = ROOTS.find((r) => r.id === parentKey)
      const parent = byId.get(parentKey)
      const id = `new-${Date.now()}`
      const folder: MoveFolder = {
        id,
        name,
        parentId: root ? null : parentKey,
        rootId: root ? root.id : (parent?.rootId ?? "mine"),
      }
      setFolders((prev) => [...prev, folder])
      return id
    },
    [byId],
  )

  const isVault = useCallback((key: string) => !!byId.get(key)?.vault, [byId])

  const labelOf = useCallback(
    (key: string) => ROOTS.find((r) => r.id === key)?.name ?? byId.get(key)?.name ?? "",
    [byId],
  )

  return { folders, byId, childrenOf, childrenOfKey, pathOf, keyPathOf, addFolder, isVault, labelOf }
}

export type FolderApi = ReturnType<typeof useFolders>

/** 같은 이름 피하기: 새 폴더, 새 폴더 2 ... */
export function nextFolderName(siblings: MoveFolder[]) {
  const names = new Set(siblings.map((s) => s.name))
  if (!names.has("새 폴더")) return "새 폴더"
  let i = 2
  while (names.has(`새 폴더 ${i}`)) i++
  return `새 폴더 ${i}`
}

/** 검색어 일치 부분 강조 */
export function Highlight({ text, query }: { text: string; query: string }) {
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

/** 겹쳐 쌓인 파일 아이콘: 옮기는 항목 요약용 */
export function MovingStack() {
  return (
    <div className="relative h-9 w-9 shrink-0">
      {MOVING.slice(0, 3)
        .reverse()
        .map((n, i, arr) => {
          const depth = arr.length - 1 - i
          return (
            <span
              key={n.id}
              className="absolute grid h-7 w-7 place-items-center rounded-md border bg-card shadow-sm"
              style={{ left: depth * 4, top: depth * 3, zIndex: 10 - depth }}
            >
              <KindIcon kind={n.kind} size={14} />
            </span>
          )
        })}
    </div>
  )
}
