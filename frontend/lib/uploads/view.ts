/**
 * 업로드 큐의 순수 계산: 요약(진행률, 남은 시간), 목록 안 진행 행 순서와 묶기.
 * 상태와 네트워크는 store.ts, 여기는 화면에 뿌릴 값만 (단위 테스트 대상).
 */

export type UploadState = "queued" | "uploading" | "done" | "failed" | "canceled"

/** view 계산에 필요한 최소 필드 (store 의 UploadItem 이 이것을 만족) */
export interface UploadLike {
  state: UploadState
  size: number
  loaded: number
  /** 바이트/초 (uploading 일 때만 의미) */
  speed: number
}

export interface UploadSummary {
  total: number
  loaded: number
  pct: number
  speed: number
  /** 남은 시간(초). 속도를 모르면 0 */
  eta: number
  /** 대기 + 업로드 중 */
  active: number
  done: number
  failed: number
  count: number
}

export function summarize(items: readonly UploadLike[]): UploadSummary {
  const live = items.filter((u) => u.state !== "canceled")
  const total = live.reduce((s, u) => s + u.size, 0)
  const loaded = live.reduce((s, u) => s + Math.min(u.loaded, u.size), 0)
  const speed = live.reduce((s, u) => s + (u.state === "uploading" ? u.speed : 0), 0)
  const pending = live.filter((u) => u.state === "uploading" || u.state === "queued")
  const remaining = pending.reduce((s, u) => s + Math.max(0, u.size - u.loaded), 0)
  return {
    total,
    loaded,
    pct: total ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
    speed,
    eta: speed > 0 ? remaining / speed : 0,
    active: pending.length,
    done: live.filter((u) => u.state === "done").length,
    failed: live.filter((u) => u.state === "failed").length,
    count: live.length,
  }
}

export function pctOf(u: UploadLike): number {
  return u.size ? Math.min(100, Math.round((u.loaded / u.size) * 100)) : u.state === "done" ? 100 : 0
}

export function formatEta(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return ""
  if (sec < 60) return `${Math.ceil(sec)}초 남음`
  if (sec < 3600) return `${Math.ceil(sec / 60)}분 남음`
  return `${Math.floor(sec / 3600)}시간 ${Math.ceil((sec % 3600) / 60)}분 남음`
}

/** 목록 안에 펼쳐 보이는 진행 행 수. 나머지는 "외 N개" 한 줄 */
export const SHOW_ROWS = 3

export interface ListRows<T> {
  /** 실패: 묶지 않고 항상 위 */
  failed: T[]
  /** 업로드 중 → 대기 순으로, 펼친 만큼 */
  shown: T[]
  /** 접혀 있는 나머지 */
  hidden: T[]
}

/** 한 폴더의 진행 행 배치: 실패 먼저, 업로드 중이 대기보다 먼저, SHOW_ROWS 초과분은 접기 */
export function arrangeRows<T extends UploadLike>(items: readonly T[], expanded: boolean): ListRows<T> {
  const failed = items.filter((u) => u.state === "failed")
  const rest = items
    .filter((u) => u.state === "uploading")
    .concat(items.filter((u) => u.state === "queued"))
  const shown = expanded ? rest : rest.slice(0, SHOW_ROWS)
  return { failed, shown, hidden: rest.slice(shown.length) }
}
