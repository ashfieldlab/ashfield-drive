/**
 * 인증 없이 백엔드 `/s/*` 로 forward.
 *
 * 보호 BFF(/api/v1)와 분리: Authorization, X-Active-Workspace-Id 헤더를 절대 붙이지 않는다.
 * 외부 링크 페이지(`/s/[token]`)가 같은 오리진에서 안전하게 호출하게 해 주는 얇은 프록시.
 */

import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = (
  process.env.BACKEND_INTERNAL_URL || "http://localhost:8200"
).replace(/\/$/, "")

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params
  const targetUrl = new URL(`/s/${path.join("/")}`, BACKEND_URL)
  targetUrl.search = req.nextUrl.search

  const headers = new Headers()
  const ct = req.headers.get("content-type")
  if (ct) headers.set("Content-Type", ct)
  // 외부 링크 열람 기록용 접속 IP (nginx 가 붙인 값 전달). 보안 판단엔 안 쓴다.
  const xff = req.headers.get("x-forwarded-for")
  if (xff) headers.set("X-Forwarded-For", xff)

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
  } catch {
    // backend 자체 도달 불가 (네트워크/DNS/down): 표준 JSON 으로 응답
    return NextResponse.json(
      { detail: "Backend unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    )
  }

  // 5xx 응답은 backend 의 HTML 에러 페이지일 수 있음: JSON 으로 정규화
  if (upstream.status >= 500) {
    return NextResponse.json(
      { detail: `Service error (${upstream.status})` },
      { status: upstream.status, headers: { "Cache-Control": "no-store" } },
    )
  }

  const resHeaders = new Headers()
  const resCt = upstream.headers.get("content-type")
  if (resCt) resHeaders.set("content-type", resCt)
  resHeaders.set("Cache-Control", "no-store")

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  })
}

export const GET = proxy
export const POST = proxy
