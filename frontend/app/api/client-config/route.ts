/**
 * 데스크톱 클라이언트(Ashfield Sync) 접속 정보: 인증 없이 공개.
 *
 * 사용자는 Drive 주소 하나만 입력하고, 클라이언트가 여기서 계정 서버(OIDC issuer)와
 * 토큰 resource(= 이 앱의 공개 주소, 백엔드 AUTH_AUDIENCE)를 알아낸다.
 * API 는 같은 주소의 BFF(`/api/v1/*`, 외부 Bearer 통과)로 부른다.
 */

import { NextResponse } from "next/server"

import { authEnv } from "@/lib/env"

export const dynamic = "force-dynamic"

export function GET() {
  return NextResponse.json(
    { account_url: authEnv.accountURL, drive_url: authEnv.baseURL },
    { headers: { "Cache-Control": "no-store" } },
  )
}
