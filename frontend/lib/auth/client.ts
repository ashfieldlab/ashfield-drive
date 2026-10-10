/**
 * Better Auth 클라이언트 — 로그인 화면·로그아웃 버튼 전용 (same-origin `/api/auth/*`).
 * 앱 데이터의 신원은 여전히 `useAppContext()`(= /api/v1/me) 로 얻는다.
 */

import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient()
