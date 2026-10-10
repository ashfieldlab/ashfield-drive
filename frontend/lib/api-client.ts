/**
 * 클라이언트 사이드 API fetch — SPEC §2.3.
 *
 * 책임:
 *   - 자동 타임아웃 (NEXT_PUBLIC_API_TIMEOUT_MS)
 *   - X-Active-Company-Id 자동 첨부 (쿠키에서 읽음)
 *   - 401 → NextAuth signOut + /login 리다이렉트
 *   - 활성 요청 카운팅 (전역 로딩바 구독)
 *   - request_id 로깅
 *
 * 자격 증명은 same-origin 쿠키로 자동 전달되고 BFF 가 서버 사이드에서 헤더로 바꾼다.
 * BFF 라우트(/api/proxy)를 거치는 경우는 그 라우트가 Bearer로 변환.
 *
 * Server Components/Actions에선 lib/api.ts를 사용.
 */

import { isPublicPath } from "@/lib/public-paths"
import { COOKIES } from "@/lib/cookies"
import { env } from "@/lib/env"
import { ApiError, type ApiErrorBody } from "@/lib/errors"
import { logger } from "@/lib/utils/logger"

// ApiError 는 lib/errors.ts 표준 — code/params/친화 메시지 lookup 통합.
export { ApiError } from "@/lib/errors"

// -----------------------------------------------------------------------------
// 활성 요청 카운터 (전역 로딩바용)
// -----------------------------------------------------------------------------

type CountListener = (count: number) => void

let activeCount = 0
const listeners = new Set<CountListener>()

function notifyCount(): void {
  for (const cb of listeners) cb(activeCount)
}

export function subscribeActiveRequests(cb: CountListener): () => void {
  listeners.add(cb)
  cb(activeCount)
  return () => listeners.delete(cb)
}

// -----------------------------------------------------------------------------
// 헤더 헬퍼
// -----------------------------------------------------------------------------

function readActiveCompanyFromCookie(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${COOKIES.activeCompany}=([^;]+)`),
  )
  return match ? decodeURIComponent(match[1]) : null
}

function buildHeaders(
  init: HeadersInit | undefined,
  body: unknown,
): Headers {
  const headers = new Headers(init)
  // FormData에는 브라우저가 Content-Type을 boundary 포함해서 자동 set — 우리가 박으면 깨짐
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  const active = readActiveCompanyFromCookie()
  if (active && !headers.has("X-Active-Company-Id")) {
    // HTTP header value 는 ByteString (latin-1) 만 안전. 한글 회사 ID 면
    // fetch API 가 TypeError 던짐 → percent-encode 로 전송, backend 가 unquote.
    headers.set("X-Active-Company-Id", encodeURIComponent(active))
  }
  return headers
}

// -----------------------------------------------------------------------------
// 코어 fetch
// -----------------------------------------------------------------------------

export interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown
  timeoutMs?: number
}

export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { body, timeoutMs, headers: initHeaders, signal: userSignal, ...rest } =
    options
  const fullUrl = path.startsWith("http") ? path : `${env.apiUrl}${path}`

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs ?? env.apiTimeoutMs,
  )
  userSignal?.addEventListener("abort", () => controller.abort(), { once: true })

  activeCount += 1
  notifyCount()

  try {
    const isFormData =
      typeof FormData !== "undefined" && body instanceof FormData
    const response = await fetch(fullUrl, {
      cache: "no-store",
      ...rest,
      headers: buildHeaders(initHeaders, body),
      body:
        body === undefined
          ? undefined
          : isFormData
            ? (body as FormData)
            : JSON.stringify(body),
      signal: controller.signal,
      credentials: "include",
    })
    const requestId = response.headers.get("x-request-id") ?? undefined

    if (!response.ok) {
      const parsed = (await safeJson(response)) as ApiErrorBody | null
      const body: ApiErrorBody = parsed ?? {}
      // legacy detail 을 message 로 흡수 (HTTPException 호환)
      if (!body.message && typeof body.detail === "string") {
        body.message = body.detail
      } else if (!body.message && Array.isArray(body.detail)) {
        body.message = formatValidationDetail(body.detail)
      } else if (
        !body.message &&
        body.detail &&
        typeof body.detail === "object" &&
        !Array.isArray(body.detail)
      ) {
        // 구조화 detail ({code, message, ...}) — 예: STORAGE_QUOTA_EXCEEDED
        const d = body.detail as { message?: string; code?: string }
        if (d.message) body.message = d.message
        if (d.code && !body.code) body.code = d.code
      }
      if (!body.message) body.message = response.statusText
      if (!body.request_id && requestId) body.request_id = requestId

      logger.warn("api_error", {
        category: "api",
        path,
        status: response.status,
        request_id: requestId,
        code: body.code,
        message: body.message,
      })

      // 401 → 세션 소실. 로그인으로 보내고 원래 페이지로 복귀시킨다.
      // 루프 가드: 방금(10초 내) 재인증했는데 또 401 = 백엔드 설정 오류(aud/issuer/게이트웨이)
      // 신호 → 무한 왕복 방지 위해 이번엔 리다이렉트 안 하고 에러만 통과.
      if (
        response.status === 401 &&
        typeof window !== "undefined" &&
        !isPublicPath(location.pathname)
      ) {
        const KEY = "ashfield:reauth-at"
        const now = Date.now()
        if (now - Number(sessionStorage.getItem(KEY) ?? 0) > 10_000) {
          sessionStorage.setItem(KEY, String(now))
          const cb = encodeURIComponent(location.pathname + location.search)
          window.location.href = `/login?callbackUrl=${cb}`
        }
      }

      throw new ApiError(response.status, body)
    }

    if (response.status === 204) return null as T
    return (await response.json()) as T
  } catch (err) {
    if (err instanceof ApiError) throw err
    if ((err as { name?: string }).name === "AbortError") {
      throw new ApiError(0, { code: "TIMEOUT", message: "Request timeout" })
    }
    logger.error("api_failed", {
      category: "api",
      path,
      error: (err as Error).message,
    })
    throw new ApiError(0, { code: "NETWORK_ERROR", message: "Network error" })
  } finally {
    clearTimeout(timeout)
    activeCount = Math.max(0, activeCount - 1)
    notifyCount()
  }
}

/**
 * 파일 다운로드 — JSON 이 아닌 응답(CSV 등)을 blob 으로 받아 저장.
 * buildHeaders 로 X-Active-Company-Id 자동 첨부(자격 증명은 BFF 가 쿠키에서 해석).
 */
export async function apiDownload(
  path: string,
  filename: string,
): Promise<void> {
  const fullUrl = path.startsWith("http") ? path : `${env.apiUrl}${path}`
  const response = await fetch(fullUrl, {
    cache: "no-store",
    headers: buildHeaders(undefined, undefined),
    credentials: "include",
  })
  if (!response.ok) {
    throw new ApiError(response.status, {
      code: "DOWNLOAD_FAILED",
      message: `다운로드 실패 (${response.status})`,
    })
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function formatValidationDetail(detail: unknown[]): string {
  return detail
    .map((d) => {
      if (d && typeof d === "object") {
        const loc = Array.isArray((d as { loc?: unknown[] }).loc)
          ? ((d as { loc: unknown[] }).loc as unknown[]).slice(1).join(".")
          : ""
        const msg = (d as { msg?: string }).msg ?? ""
        return loc ? `${loc}: ${msg}` : msg
      }
      return String(d)
    })
    .join("; ")
}

// -----------------------------------------------------------------------------
// 파일 업로드 (multipart)
// -----------------------------------------------------------------------------

export async function apiUploadFile<T = unknown>(
  path: string,
  file: File,
  options: Omit<ApiOptions, "body"> = {},
): Promise<T> {
  const form = new FormData()
  form.append("file", file)
  return api<T>(path, { ...options, method: "POST", body: form })
}
