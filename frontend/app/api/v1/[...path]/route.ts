/**
 * BFF Proxy: `/api/v1/*` → 백엔드로 서버 사이드 forward.
 *
 *   - 같은 오리진이라 CORS 없음.
 *   - 자격 증명은 서버 사이드에서만 만든다: 브라우저 JS 에 노출 X.
 *     Better Auth 세션 쿠키 → 계정 서버 액세스 토큰(만료 임박 시 refresh) → `Authorization: Bearer`
 *     (ADR-0024). 갱신 실패면 세션을 지우고 401 → 클라이언트가 /login 으로.
 *   - X-Active-Company-Id 헤더는 클라이언트가 보낸 그대로 전달, 없으면 쿠키에서 보강.
 */

import { NextRequest, NextResponse } from "next/server"

import { endSessionCookies, resolveBackendAuth } from "@/lib/auth/session"
import { COOKIES } from "@/lib/cookies"
import { authEnv } from "@/lib/env"

// 백엔드 도달 주소: BACKEND_INTERNAL_URL. 운영(컨테이너/k8s 등)에서는 backend 서비스 host.
const BACKEND_URL = authEnv.backendURL

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  // 외부 Bearer(데스크톱 클라이언트 등이 계정 서버에서 직접 받은 액세스 토큰)가 오면 그대로, 없으면
  // 세션의 계정 서버 토큰을 쓴다. 어느 쪽이든 백엔드가 JWKS 로 검증하므로 위조는 무의미하다.
  const externalAuth = req.headers.get("authorization")
  let authHeaders: Record<string, string>
  if (externalAuth && /^Bearer\s+/i.test(externalAuth)) {
    authHeaders = { Authorization: externalAuth }
  } else {
    const resolved = await resolveBackendAuth(req.headers)
    if (!resolved.ok) {
      const res = NextResponse.json(
        { detail: resolved.reauth ? "Re-authentication required" : "Not authenticated" },
        { status: resolved.status, headers: { "Cache-Control": "no-store" } },
      )
      // 토큰 갱신 실패 → 세션을 지워 /login 이 다시 계정 서버로 보내게 한다.
      if (resolved.reauth) {
        for (const c of await endSessionCookies(req.headers)) res.headers.append("Set-Cookie", c)
      }
      return res
    }
    authHeaders = resolved.headers
  }

  const { path } = await ctx.params
  const targetPath = `/api/v1/${path.join("/")}`
  const targetUrl = new URL(targetPath, BACKEND_URL)
  targetUrl.search = req.nextUrl.search

  // 헤더 구성: 인증·테넌트만 명시적으로, content-type은 passthrough
  const headers = new Headers()
  for (const [k, v] of Object.entries(authHeaders)) headers.set(k, v)

  const activeCompany =
    req.headers.get("X-Active-Company-Id") ??
    req.cookies.get(COOKIES.activeCompany)?.value
  if (activeCompany) {
    // HTTP header 는 ByteString (≤ 0xFF) 만 허용: 한글이 박히면 fetch 가 throw.
    // 잘못된 cookie/header (예: 회사 ID 에 한글 회사명) 가 들어와도 500 대신
    // 헤더만 skip 하고 통과: backend 가 active company 누락으로 4xx 응답하면
    // 사용자가 회사 재선택할 수 있다.
    if (/^[\x20-\x7E]+$/.test(activeCompany)) {
      headers.set("X-Active-Company-Id", activeCompany)
    } else {
      console.warn("[bff] X-Active-Company-Id non-ASCII, skipping", {
        value: activeCompany,
      })
    }
  }

  const contentType = req.headers.get("content-type")
  if (contentType) headers.set("Content-Type", contentType)

  const xRequestId = req.headers.get("x-request-id")
  if (xRequestId) headers.set("X-Request-ID", xRequestId)

  const hasBody = !["GET", "HEAD"].includes(req.method)
  const body = hasBody ? await req.arrayBuffer() : undefined

  let upstream: Response
  try {
    upstream = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body,
      cache: "no-store",
    })
  } catch (err) {
    // 백엔드 도달 자체 실패: ECONNREFUSED, DNS, timeout 등.
    // 무처리로 throw 하면 Next.js 가 generic 500 을 뱉어 사용자가 원인을 모름.
    // 명시적 502 + JSON 응답으로 BFF·backend 경계의 책임을 분명히.
     
    console.error("[bff] backend unreachable", {
      target: targetUrl.toString(),
      method: req.method,
      error: (err as Error).message,
    })
    return NextResponse.json(
      {
        detail: `Backend unreachable (${BACKEND_URL}). 백엔드 서버가 띄워졌는지·포트가 맞는지 확인.`,
        target: BACKEND_URL,
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    )
  }

  const resHeaders = new Headers()
  const resCt = upstream.headers.get("content-type")
  if (resCt) resHeaders.set("content-type", resCt)
  const resReqId = upstream.headers.get("x-request-id")
  if (resReqId) resHeaders.set("x-request-id", resReqId)
  // 브라우저·Next 가 응답을 캐시해서 삭제 직후 stale 이 살아남는 것 방지
  resHeaders.set("Cache-Control", "no-store, must-revalidate")

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
