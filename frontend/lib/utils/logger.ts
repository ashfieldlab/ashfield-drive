/**
 * 프론트엔드 카테고리 로거 — SPEC §2.7.
 *
 * 카테고리 (프론트 한정): auth | api | biz | ui
 *
 * 사용:
 *   import { logger } from "@/lib/utils/logger"
 *   logger.info("login_success", { category: "auth", sub })
 *
 * 환경변수:
 *   NEXT_PUBLIC_LOG_CATEGORIES=""        → info 이상만
 *   NEXT_PUBLIC_LOG_CATEGORIES="auth,api" → 두 카테고리 debug 출력
 *   NEXT_PUBLIC_LOG_CATEGORIES="*"       → 전부
 *
 * 운영(NODE_ENV=production)에서는 error만 콘솔 출력.
 */

export type Category = "auth" | "api" | "biz" | "ui"

export interface LogContext {
  category: Category
  [key: string]: unknown
}

const IS_PROD = process.env.NODE_ENV === "production"
const RAW_CATEGORIES = process.env.NEXT_PUBLIC_LOG_CATEGORIES ?? ""

const debugCategories: Set<string> | null = (() => {
  const raw = RAW_CATEGORIES.trim()
  if (raw === "*") return null // 전부
  if (!raw) return new Set() // 없음 — debug는 출력 안 함
  return new Set(raw.split(",").map((c) => c.trim()).filter(Boolean))
})()

function shouldEmitDebug(category: Category): boolean {
  if (debugCategories === null) return true
  return debugCategories.has(category)
}

function format(level: string, msg: string, ctx: LogContext): unknown[] {
  const { category, ...rest } = ctx
  if (IS_PROD) {
    return [JSON.stringify({ level, msg, category, ...rest })]
  }
  const extras = Object.keys(rest).length ? rest : ""
  return [`[${level}] [${category}] ${msg}`, extras].filter(
    (v) => v !== "" && v !== undefined,
  )
}

export const logger = {
  debug(msg: string, ctx: LogContext): void {
    if (IS_PROD) return
    if (!shouldEmitDebug(ctx.category)) return
    console.debug(...format("debug", msg, ctx))
  },
  info(msg: string, ctx: LogContext): void {
    if (IS_PROD) return
    console.info(...format("info", msg, ctx))
  },
  warn(msg: string, ctx: LogContext): void {
    console.warn(...format("warn", msg, ctx))
  },
  error(msg: string, ctx: LogContext): void {
    console.error(...format("error", msg, ctx))
  },
}
