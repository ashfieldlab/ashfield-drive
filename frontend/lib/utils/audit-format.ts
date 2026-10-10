/**
 * audit_log / activity 항목을 사용자 친화 문장으로 변환.
 *
 * 백엔드는 raw entity_type/action/meta 만 내려보냄. 사용자 표시 카피와 매핑은 여기서.
 */

export interface AuditItemLike {
  actor_name?: string | null
  actor_sub?: string | null
  actor_type?: string  // user | system | public
  action: string
  entity_type: string
  entity_id: string
  meta: Record<string, unknown>
}

const ENTITY_LABEL: Record<string, string> = {
  node: "파일/폴더",
  file_share: "공유",
  external_link: "외부 공유 링크",
  notification: "알림",
  webhook: "Webhook",
  workspace_membership: "워크스페이스 멤버",
  system_smtp_config: "전역 SMTP 설정",
  workspace_quota: "워크스페이스 quota",
  file_access: "열람",
  file_version: "파일 버전",
}

const ACTION_LABEL: Record<string, string> = {
  create: "생성",
  update: "수정",
  delete: "삭제",
  restore: "복원",
  share: "공유",
  unshare: "공유 해제",
  empty_trash: "휴지통 비우기",
  rotate_token: "토큰 재발급",
  download: "다운로드",
  preview: "미리보기",
  version_download: "버전 다운로드",
  zip_download: "폴더 zip 다운로드",
  link_access: "외부 링크로 받음",
}

export function actorDisplay(item: AuditItemLike): string {
  if (item.actor_type === "public") return "외부 링크 방문자"
  if (item.actor_type === "system" || !item.actor_sub) return "시스템"
  return item.actor_name || item.actor_sub
}

export function entityLabel(entityType: string): string {
  return ENTITY_LABEL[entityType] ?? entityType
}

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action
}

/**
 * meta 의 핵심 식별 정보를 한 줄로. 없으면 빈 문자열.
 *
 * 우선순위: name > title > host > 그 외 첫 string. size 가 있으면 size 도 보탬.
 */
export function metaSummary(item: AuditItemLike): string {
  const m = item.meta
  // 보안 폴더 항목: 암호문 이름과 크기를 절대 노출하지 않음 (백엔드가 vault 마커만 내려줌).
  if (m.vault === true) return ""
  const subject =
    typeof m.name === "string"
      ? m.name
      : typeof m.title === "string"
        ? m.title
        : typeof m.host === "string"
          ? m.host
          : null
  const parts: string[] = []
  if (subject) parts.push(`"${subject}"`)
  if (typeof m.size === "number") parts.push(formatBytes(m.size))
  if (typeof m.purged === "number") parts.push(`${m.purged}개 항목`)
  if (typeof m.ip === "string") parts.push(`IP ${m.ip}`)
  return parts.join(", ")
}

/**
 * "관리자가 LICENSE.txt 파일을 생성했습니다" 같은 문장.
 *
 * subject 가 있으면 그것까지 포함, 없으면 entity_type + action.
 */
export function describe(item: AuditItemLike): string {
  const actor = actorDisplay(item)
  const m = item.meta
  // 보안 폴더 항목: 구체 이름 없이 일반 라벨로.
  if (m.vault === true) {
    return `${actor}, 🔒 보안 폴더 항목을(를) ${actionLabel(item.action)}`
  }
  const subject =
    typeof m.name === "string"
      ? m.name
      : typeof m.title === "string"
        ? m.title
        : null
  const entity = entityLabel(item.entity_type)
  const action = actionLabel(item.action)
  if (subject) return `${actor}, ${subject} ${entity}을(를) ${action}`
  return `${actor}, ${entity} ${action}`
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)}KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)}MB`
  return `${(b / 1024 ** 3).toFixed(1)}GB`
}

/** ISO datetime → 상대 시간 ("방금", "3분 전", "2시간 전", "어제", "3일 전"). */
export function relativeTime(iso: string): string {
  const now = Date.now()
  const t = new Date(iso).getTime()
  const diff = Math.max(0, now - t)
  const s = Math.floor(diff / 1000)
  if (s < 30) return "방금"
  if (s < 60) return `${s}초 전`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.floor(h / 24)
  if (d === 1) return "어제"
  if (d < 7) return `${d}일 전`
  // 그 이상은 절대 날짜로
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

// ---------------------------------------------------------------------------
// 활동 내역 문장용 헬퍼 (조사, 날짜 묶음, 파일 종류)
// ---------------------------------------------------------------------------

/** 받침 여부. 영문은 철자 이름(엘, 엠, 엔, 알)으로 읽는다고 본다. 확장자 앞 이름이 아닌 마지막 글자 기준 */
function batchim(word: string): { yes: boolean; rieul: boolean } {
  const c = word.trim().slice(-1)
  if (!c) return { yes: false, rieul: false }
  const code = c.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) {
    const j = (code - 0xac00) % 28
    return { yes: j !== 0, rieul: j === 8 }
  }
  if (/[0-9]/.test(c)) return { yes: "013678".includes(c), rieul: "178".includes(c) }
  const l = c.toLowerCase()
  return { yes: "lmnr".includes(l), rieul: "lr".includes(l) }
}

/** 을/를 */
export const josaEul = (w: string): string => (batchim(w).yes ? "을" : "를")
/** 으로/로 (ㄹ 받침은 로) */
export const josaRo = (w: string): string => {
  const b = batchim(w)
  return b.yes && !b.rieul ? "으로" : "로"
}
/** 과/와 */
export const josaGwa = (w: string): string => (batchim(w).yes ? "과" : "와")
/** 이/가 */
export const josaI = (w: string): string => (batchim(w).yes ? "이" : "가")

export type DayBucket = "오늘" | "어제" | "이번 주" | "이전"
export const DAY_BUCKETS: DayBucket[] = ["오늘", "어제", "이번 주", "이전"]

/** 오늘 / 어제 / 이번 주(최근 7일) / 이전 */
export function dayBucket(iso: string, now: Date = new Date()): DayBucket {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const t = new Date(iso).getTime()
  const day = 86_400_000
  if (t >= start.getTime()) return "오늘"
  if (t >= start.getTime() - day) return "어제"
  if (t >= start.getTime() - 6 * day) return "이번 주"
  return "이전"
}

export type FileKind =
  | "folder"
  | "image"
  | "pdf"
  | "doc"
  | "sheet"
  | "slide"
  | "video"
  | "audio"
  | "archive"
  | "code"
  | "text"

const EXT_KIND: Record<string, FileKind> = {
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image", heic: "image", bmp: "image", avif: "image",
  pdf: "pdf",
  doc: "doc", docx: "doc", hwp: "doc", hwpx: "doc", odt: "doc", rtf: "doc", pages: "doc",
  xls: "sheet", xlsx: "sheet", csv: "sheet", ods: "sheet", numbers: "sheet",
  ppt: "slide", pptx: "slide", key: "slide", odp: "slide",
  mp4: "video", mov: "video", webm: "video", mkv: "video", avi: "video",
  mp3: "audio", wav: "audio", m4a: "audio", flac: "audio", ogg: "audio",
  zip: "archive", tar: "archive", gz: "archive", "7z": "archive", rar: "archive",
  js: "code", ts: "code", tsx: "code", jsx: "code", py: "code", json: "code", html: "code", css: "code", sh: "code", go: "code", rs: "code", java: "code", xml: "code", yml: "code", yaml: "code",
}

/** 이름(확장자)과 MIME 으로 표시용 파일 종류 */
export function fileKind(
  name: string | null | undefined,
  mime: string | null | undefined,
  isFolder = false,
): FileKind {
  if (isFolder) return "folder"
  const ext = name?.includes(".") ? name.split(".").pop()!.toLowerCase() : ""
  if (ext && EXT_KIND[ext]) return EXT_KIND[ext]
  if (mime) {
    if (mime.startsWith("image/")) return "image"
    if (mime.startsWith("video/")) return "video"
    if (mime.startsWith("audio/")) return "audio"
    if (mime === "application/pdf") return "pdf"
    if (mime.includes("zip") || mime.includes("compressed")) return "archive"
  }
  return "text"
}
