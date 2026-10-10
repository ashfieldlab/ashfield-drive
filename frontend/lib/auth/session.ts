/**
 * BFF → 백엔드 자격 증명 (ADR-0023). 서버 사이드 전용.
 *
 * 브라우저에는 Better Auth 세션 쿠키(httpOnly)만 있다. BFF 가 그 세션으로 짧은 JWT(5분)를
 * 받아 `Authorization: Bearer` 로 백엔드에 넘기고, 백엔드는 /api/auth/jwks 로 검증한다.
 */

import "server-only"

import { APIError } from "better-auth/api"

import { auth } from "@/lib/auth/server"

export type BackendAuth =
  | { ok: true; headers: Record<string, string> }
  | { ok: false; status: 401 | 503 }

/** 이 요청(쿠키 포함 헤더)의 세션으로 백엔드용 Bearer 헤더를 만든다. */
export async function resolveBackendAuth(headers: Headers): Promise<BackendAuth> {
  try {
    const { token } = await auth.api.getToken({ headers })
    if (!token) return { ok: false, status: 401 }
    return { ok: true, headers: { Authorization: `Bearer ${token}` } }
  } catch (err) {
    // 세션 없음·만료 → 401 (로그인으로). 그 외(DB 장애 등)는 503 — 401 로 바꾸면 로그인 왕복만 반복된다.
    if (err instanceof APIError && (err.statusCode === 401 || err.statusCode === 403)) {
      return { ok: false, status: 401 }
    }
    throw err
  }
}

/** 서버 컴포넌트용 세션 조회 (없으면 null). */
export async function getServerSession(headers: Headers) {
  return auth.api.getSession({ headers })
}
