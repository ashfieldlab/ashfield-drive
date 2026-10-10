import type { ReactNode } from "react"
import {
  History,
  Link2,
  Link2Off,
  MoveRight,
  PencilLine,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from "lucide-react"

import {
  fileKind,
  josaEul,
  josaGwa,
  josaRo,
  type FileKind,
} from "@/lib/utils/audit-format"

import type { ActivityItem } from "./types"

export type ActivityKind =
  | "create"
  | "upload"
  | "rename"
  | "move"
  | "version"
  | "delete"
  | "restore"
  | "share"
  | "unshare"
  | "link"
  | "unlink"
  | "empty_trash"
  | "other"

export const ACTION_META: Record<ActivityKind, { icon: LucideIcon; tone: string }> = {
  create: { icon: Plus, tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  upload: { icon: Upload, tone: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  rename: { icon: PencilLine, tone: "bg-muted text-foreground/80" },
  move: { icon: MoveRight, tone: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" },
  version: { icon: History, tone: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  delete: { icon: Trash2, tone: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
  restore: { icon: RotateCcw, tone: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  share: { icon: UserPlus, tone: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  unshare: { icon: UserMinus, tone: "bg-muted text-muted-foreground" },
  link: { icon: Link2, tone: "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300" },
  unlink: { icon: Link2Off, tone: "bg-muted text-muted-foreground" },
  empty_trash: { icon: Trash2, tone: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
  other: { icon: PencilLine, tone: "bg-muted text-muted-foreground" },
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null)

/** 백엔드 action + meta 를 화면의 동작 종류로 */
export function activityKind(it: ActivityItem): ActivityKind {
  const m = it.meta
  switch (it.action) {
    case "create":
      return m.kind === "file" ? "upload" : "create"
    case "update": {
      if (m.overwrite === true) return "version"
      const renamed = !!m.old_name && !!m.new_name && m.old_name !== m.new_name
      const moved = "old_parent_id" in m && m.old_parent_id !== m.new_parent_id
      if (moved) return "move"
      if (renamed) return "rename"
      return "other"
    }
    case "delete":
      return "delete"
    case "restore":
      return "restore"
    case "share":
      return m.external === true ? "link" : "share"
    case "unshare":
      return m.external === true ? "unlink" : "unshare"
    case "empty_trash":
      return "empty_trash"
    default:
      return "other"
  }
}

/** 표시할 대상 이름. 보안 폴더 항목은 이름을 쓰지 않는다 */
export function targetName(it: ActivityItem): string {
  if (it.meta.vault === true) return "보안 폴더 항목"
  return (
    it.node?.name ??
    str(it.meta.new_name) ??
    str(it.meta.name) ??
    (it.meta.team_folder === true ? "부서 폴더" : "항목")
  )
}

export function targetKind(it: ActivityItem): FileKind {
  const isFolder = (it.node?.kind ?? it.meta.kind) === "folder" || it.meta.team_folder === true
  return fileKind(targetName(it), it.node?.mime ?? null, isFolder)
}

export function rootLabel(scope: string | undefined): string {
  return scope === "shared" ? "워크스페이스" : "내 파일"
}

/** 업로드/생성 위치. 알 수 없으면 null */
function placeOf(it: ActivityItem): string | null {
  if (it.meta.vault === true) return null
  // 생성 당시 위치 (그 뒤에 옮겨졌어도). 예전 기록엔 parent_id 가 없어 현재 위치로 대신한다
  if ("parent_id" in it.meta) {
    if (it.meta.parent_id === null) return it.node ? rootLabel(it.node.scope) : null
    return it.created_in_name ?? null
  }
  if (!it.node) return null
  if (it.node.parent_id === null) return rootLabel(it.node.scope)
  return it.node.parent_name
}

export function actorLabel(it: ActivityItem): string {
  if (!it.actor_sub) return "시스템"
  return it.actor_name ?? "알 수 없는 사용자"
}

interface Renderers {
  actor: (name: string) => ReactNode
  target: (name: string) => ReactNode
  em: (s: string) => ReactNode
}

/** "김하늘님이 디자인에 로고.svg를 올렸습니다" */
export function activitySentence(it: ActivityItem, r: Renderers): ReactNode {
  const m = it.meta
  const actor = actorLabel(it)
  const who = it.actor_sub ? <>{r.actor(actor)}님이 </> : <>{r.actor(actor)}이 </>
  const name = targetName(it)
  const t = r.target(name)
  const kind = activityKind(it)

  switch (kind) {
    case "upload": {
      const place = placeOf(it)
      return place ? (
        <>{who}{r.em(place)}에 {t}{josaEul(name)} 올렸습니다</>
      ) : (
        <>{who}{t}{josaEul(name)} 올렸습니다</>
      )
    }
    case "create": {
      if (m.team_folder === true) return <>{who}부서 폴더 {t}{josaEul(name)} 만들었습니다</>
      const place = placeOf(it)
      return place ? (
        <>{who}{r.em(place)}에 {t}{josaEul(name)} 만들었습니다</>
      ) : (
        <>{who}{t}{josaEul(name)} 만들었습니다</>
      )
    }
    case "rename": {
      const old = str(m.old_name)
      return (
        <>{who}{old ? <>{r.em(old)}의 </> : null}이름을 {t}{josaRo(name)} 바꿨습니다</>
      )
    }
    case "move": {
      const dest =
        it.new_parent_name ??
        (m.new_parent_id === null ? rootLabel(it.node?.scope) : "다른 폴더")
      const old = str(m.old_name)
      const renamed = old && str(m.new_name) && old !== m.new_name
      if (renamed) {
        return (
          <>{who}{r.em(old)}의 이름을 {t}{josaRo(name)} 바꾸고 {r.em(dest)}{josaRo(dest)} 옮겼습니다</>
        )
      }
      return <>{who}{t}{josaEul(name)} {r.em(dest)}{josaRo(dest)} 옮겼습니다</>
    }
    case "version":
      return typeof m.restored_version === "string" ? (
        <>{who}{t}{josaEul(name)} 이전 버전으로 되돌렸습니다</>
      ) : (
        <>{who}{t}의 새 버전을 올렸습니다</>
      )
    case "delete":
      if (m.permanent === true) return <>{who}{t}{josaEul(name)} 영구 삭제했습니다</>
      if (m.team_folder === true) return <>{who}부서 폴더 {t}{josaEul(name)} 삭제했습니다</>
      return <>{who}{t}{josaEul(name)} 휴지통으로 옮겼습니다</>
    case "restore":
      return <>{who}{t}{josaEul(name)} 복원했습니다</>
    case "share": {
      const group = str(m.group_name)
      if (group || m.group) {
        const g = group ?? "부서"
        return <>{who}{t}{josaEul(name)} {r.em(g)}{josaGwa(g)} 공유했습니다</>
      }
      const label = `${it.grantee_name ?? "다른 사용자"}님`
      return <>{who}{t}{josaEul(name)} {r.em(label)}{josaGwa(label)} 공유했습니다</>
    }
    case "unshare": {
      const label = `${it.grantee_name ?? "다른 사용자"}님`
      return <>{who}{t}에서 {r.em(label)}의 접근을 해제했습니다</>
    }
    case "link":
      return <>{who}{t}의 공유 링크를 만들었습니다</>
    case "unlink":
      return <>{who}{t}의 공유 링크를 해제했습니다</>
    case "empty_trash": {
      const n = typeof m.purged === "number" ? m.purged : null
      return n !== null ? <>{who}휴지통을 비웠습니다 ({n}개)</> : <>{who}휴지통을 비웠습니다</>
    }
    default:
      return <>{who}{t}{josaEul(name)} 수정했습니다</>
  }
}

/** 문장에 대상 칩을 넣는지 (휴지통 비우기는 대상 없음) */
export function hasTarget(it: ActivityItem): boolean {
  return activityKind(it) !== "empty_trash"
}
