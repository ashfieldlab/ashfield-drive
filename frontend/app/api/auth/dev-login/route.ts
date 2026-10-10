/**
 * Dev 로그인: SKIP_AUTH 모드 전용.
 *
 *   - POST { username }       → dev_token 쿠키 발급 + JSON (로그인 카드가 사용).
 *   - GET  ?u=&redirect=/...  → 쿠키 발급 + 302 (로그인과 이동을 한 번에: e2e 용).
 *
 * 운영(SKIP_AUTH=false)에선 404: 로그인은 게이트웨이가 담당.
 */

import { NextRequest, NextResponse } from "next/server"

import { APP } from "@/lib/apps"
import { DEV_TOKEN_COOKIE, DEV_TOKEN_TTL_SECONDS, SKIP_AUTH } from "@/lib/auth-session"
import { signDevJwt } from "@/lib/dev-jwt"
import { DEV_USERS } from "@/lib/dev-users"

const isProd = process.env.NODE_ENV === "production"

function notFound() {
  return NextResponse.json(
    { detail: "dev login은 SKIP_AUTH 모드에서만 가능합니다." },
    { status: 404 },
  )
}

async function setDevCookie(res: NextResponse, username: string): Promise<boolean> {
  const user = DEV_USERS[username]
  if (!user) return false
  res.cookies.set(DEV_TOKEN_COOKIE, await signDevJwt(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProd,
    maxAge: DEV_TOKEN_TTL_SECONDS,
  })
  return true
}

export async function POST(req: NextRequest) {
  if (!SKIP_AUTH) return notFound()
  let username: string | undefined
  try {
    ;({ username } = await req.json())
  } catch {
    return NextResponse.json({ detail: "username 필요" }, { status: 400 })
  }
  const res = NextResponse.json({ ok: true })
  if (!username || !(await setDevCookie(res, username))) {
    return NextResponse.json({ detail: `알 수 없는 dev 사용자: ${username}` }, { status: 400 })
  }
  return res
}

export async function GET(req: NextRequest) {
  if (!SKIP_AUTH) return notFound()
  const username = req.nextUrl.searchParams.get("u") ?? ""
  // 같은 오리진 경로만 허용 (오픈 리다이렉트 차단).
  const raw = req.nextUrl.searchParams.get("redirect") ?? APP.home
  const redirect = raw.startsWith("/") && !raw.startsWith("//") ? raw : APP.home
  const res = NextResponse.redirect(new URL(redirect, req.nextUrl.origin))
  if (!(await setDevCookie(res, username))) {
    return NextResponse.json({ detail: `알 수 없는 dev 사용자: ${username}` }, { status: 400 })
  }
  return res
}
