/**
 * HTTP 에러 → 사용자 친화 한국어 카피 (skeleton 표준).
 *
 * 우선순위:
 *   1. 백엔드 `code` 가 ERROR_MESSAGES 에 있으면 그 카피 (override).
 *      params 가 있으면 함수형 카피로 동적 값 보간.
 *   2. HTTP status → HTTP_STATUS_MESSAGES 표준 한국어.
 *   3. status >= 500 → 일반 서버 오류, >= 400 → 일반 요청 실패.
 *   4. 모르는 케이스 → "알 수 없는 오류".
 *
 * 백엔드의 raw message (`"Slot is full"` 같은 영문 detail) 는 절대 사용자에게
 * 노출하지 않는다. 운영 카피로 보이고 싶으면 명시적으로 code 부여 + 본 파일
 * 에 등록.
 *
 * 새 에러 코드 추가 시:
 *   1. 백엔드: BusinessError(code=..., params=...) raise
 *   2. ERROR_MESSAGES 에 항목 추가 (string 또는 (params) => string)
 *   3. 한국어 톤 일관 유지: "방금 다른 분이 …" 같은 친화 카피
 */

type ParamMap = Record<string, unknown>

type ErrorMessage = string | ((params: ParamMap) => string)

/**
 * HTTP status 별 기본 한국어. code 가 없거나 unknown 일 때 fallback.
 * 추가·변경은 한 곳에서.
 */
export const HTTP_STATUS_MESSAGES: Record<number, string> = {
  // 4xx: 클라이언트 측 문제
  400: "잘못된 요청입니다.",
  401: "로그인이 필요합니다.",
  402: "결제가 필요합니다.",
  403: "접근 권한이 없습니다.",
  404: "요청한 정보를 찾을 수 없습니다.",
  405: "허용되지 않은 요청 방식입니다.",
  406: "지원하지 않는 응답 형식입니다.",
  408: "응답 시간이 초과되었습니다.",
  409: "방금 다른 변경이 있었습니다. 새로고침 후 다시 시도해주세요.",
  410: "더 이상 사용할 수 없는 항목입니다.",
  412: "사전 조건이 충족되지 않았습니다.",
  413: "파일 또는 용량이 너무 큽니다.",
  414: "주소(URL)가 너무 깁니다.",
  415: "지원하지 않는 형식입니다.",
  416: "요청한 범위가 유효하지 않습니다.",
  422: "입력 정보를 다시 확인해주세요.",
  423: "잠겨 있는 항목입니다.",
  428: "사전 조건이 필요합니다. 페이지를 새로고침한 뒤 다시 시도해주세요.",
  429: "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.",
  431: "요청 헤더가 너무 큽니다.",
  451: "법적 사유로 이용할 수 없습니다.",

  // 5xx: 서버 측 문제
  500: "서버에 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
  501: "지원하지 않는 기능입니다.",
  502: "서버와 통신할 수 없습니다.",
  503: "서비스가 일시적으로 사용할 수 없습니다.",
  504: "응답 시간이 초과되었습니다.",
  507: "저장 공간이 부족합니다.",
  511: "네트워크 인증이 필요합니다.",
}

export const ERROR_MESSAGES: Record<string, ErrorMessage> = {
  // ───── 공통 ─────
  AUTH_REQUIRED: "로그인이 필요합니다.",
  FORBIDDEN: "접근 권한이 없습니다.",
  NOT_FOUND: "찾을 수 없습니다.",
  RATE_LIMITED: "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.",

  // ───── 파일/스토리지 ─────
  STORAGE_QUOTA_EXCEEDED: (p) => {
    const used = typeof p.usage === "number" ? formatBytes(p.usage) : "?"
    const limit = typeof p.limit === "number" ? formatBytes(p.limit) : "?"
    return `저장 공간이 부족합니다. (사용 ${used} / 한도 ${limit})`
  },

  // ───── SMTP ─────
  SMTP_NOT_CONFIGURED: "SMTP 설정이 없습니다. 시스템 관리자에게 문의해주세요.",
  SMTP_SEND_FAILED: "이메일 발송에 실패했습니다.",
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)}KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)}MB`
  return `${(b / 1024 ** 3).toFixed(1)}GB`
}

export interface ApiErrorBody {
  code?: string
  message?: string
  detail?: unknown   // HTTPException 호환 (legacy)
  params?: ParamMap
  request_id?: string
}

export class ApiError extends Error {
  readonly code?: string
  readonly status: number
  readonly params: ParamMap
  readonly requestId?: string
  /** 백엔드 원본 message: 운영 디버그용. 사용자 UI 노출 금지 (raw stack 방어). */
  readonly rawMessage?: string

  constructor(status: number, body: ApiErrorBody) {
    super(friendlyError(body, status))
    this.code = body.code
    this.status = status
    this.params = body.params ?? {}
    this.requestId =
      typeof body.request_id === "string" ? body.request_id : undefined
    this.rawMessage =
      typeof body.message === "string"
        ? body.message
        : typeof body.detail === "string"
          ? body.detail
          : undefined
  }
}

/**
 * 에러 객체 또는 응답 본문 + (선택) HTTP status → 사용자 친화 한국어 카피.
 *
 * 우선순위:
 *   1. body.code 가 ERROR_MESSAGES 에 있으면 override (함수형이면 params 적용)
 *   2. HTTP status → HTTP_STATUS_MESSAGES 표준 카피
 *   3. status >= 500 → 일반 서버 오류, >= 400 → 일반 요청 실패
 *   4. 네트워크 끊김 (status 0) → 일반 네트워크 오류
 *   5. 모르는 케이스 → "알 수 없는 오류"
 *
 * **백엔드 raw message/detail 은 절대 노출하지 않음**: 영문 stack/디버그 카피 차단.
 * 운영 카피로 보이고 싶으면 code 부여 + ERROR_MESSAGES 등록.
 */
export function friendlyError(
  err: ApiErrorBody | ApiError | Error | string | unknown,
  fallbackStatus?: number,
): string {
  let code: string | undefined
  let params: ParamMap = {}
  let status: number | undefined = fallbackStatus

  if (typeof err === "string") {
    // 호출자가 명시 카피 문자열을 직접 전달한 경우: 그대로 신뢰 (그쪽 책임)
    return err
  }
  if (err instanceof ApiError) {
    code = err.code
    params = err.params
    status = err.status
  } else if (err && typeof err === "object") {
    const body = err as ApiErrorBody
    code = body.code
    params = body.params ?? {}
  }

  // 1) code override
  if (code) {
    const m = ERROR_MESSAGES[code]
    if (typeof m === "function") return m(params)
    if (typeof m === "string") return m
  }

  // 2) HTTP status 표준
  if (typeof status === "number") {
    if (HTTP_STATUS_MESSAGES[status]) return HTTP_STATUS_MESSAGES[status]
    if (status === 0) return "네트워크 오류: 연결을 확인해주세요."
    if (status >= 500)
      return "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
    if (status >= 400) return "요청 처리에 실패했습니다."
  }

  return "알 수 없는 오류가 발생했습니다."
}
