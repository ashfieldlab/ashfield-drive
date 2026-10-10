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
  // 보안 폴더 항목: 암호문 이름·크기를 절대 노출하지 않음 (백엔드가 vault 마커만 내려줌).
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
  return parts.join(" · ")
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
    return `${actor} · 🔒 보안 폴더 항목을(를) ${actionLabel(item.action)}`
  }
  const subject =
    typeof m.name === "string"
      ? m.name
      : typeof m.title === "string"
        ? m.title
        : null
  const entity = entityLabel(item.entity_type)
  const action = actionLabel(item.action)
  if (subject) return `${actor} · ${subject} ${entity}을(를) ${action}`
  return `${actor} · ${entity} ${action}`
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
