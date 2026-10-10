/**
 * Better Auth 핸들러: `/api/auth/*` (로그인 시작, 콜백, 세션, 로그아웃). ADR-0024.
 *
 *   - 계정 서버 로그인 콜백: /api/auth/callback/ashfield (계정 서버에 등록된 redirect_uri)
 *   - 인스턴스는 getAuth(): 시작 때 계정 서버 디스커버리에 실패했으면 다시 만든다.
 */

import { getAuth } from "@/lib/auth/server"

async function handle(req: Request): Promise<Response> {
  return (await getAuth()).handler(req)
}

export const GET = handle
export const POST = handle
