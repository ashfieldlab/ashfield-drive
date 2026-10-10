/**
 * Better Auth 핸들러 — `/api/auth/*` (로그인·콜백·세션·로그아웃·JWT·JWKS). ADR-0023.
 *
 *   - OAuth 콜백: /api/auth/callback/google, /api/auth/callback/github
 *   - 백엔드 검증 키: /api/auth/jwks (백엔드 AUTH_JWKS_URL)
 */

import { toNextJsHandler } from "better-auth/next-js"

import { auth } from "@/lib/auth/server"

export const { GET, POST } = toNextJsHandler(auth)
