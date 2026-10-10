/**
 * BFF → 백엔드 자격 증명 (ADR-0024). 서버 사이드 전용.
 *
 * 브라우저에는 Better Auth 세션 쿠키(httpOnly)만 있다. BFF 가 그 세션 사용자의 계정 서버
 * **액세스 토큰**(Better Auth `account` 테이블)을 꺼내 `Authorization: Bearer` 로 백엔드에 넘기고,
 * 백엔드는 계정 서버 JWKS 로 검증한다.
 *
 *   - 만료 60초 전부터 refresh_token 으로 갱신 (Better Auth `refreshToken` API: 새 토큰을 저장).
 *   - 계정 서버는 refresh_token 을 회전시키고 재사용을 감지하면 토큰 패밀리를 폐기한다 →
 *     같은 계정의 토큰 조회와 갱신은 이 프로세스 안에서 전부 직렬화한다 (single-flight + 진입 후 재조회).
 *     Better Auth `getAccessToken` 도 만료 5초 전이면 스스로 갱신하므로 저장된 토큰 조회까지
 *     single-flight 안에서만 한다. 대기 맵은 globalThis 에 둔다 (dev 에서 모듈이 다시 평가돼도 하나).
 *     여러 인스턴스로 띄우면 인스턴스 간 잠금이 필요하다 (ADR-0024).
 *   - 갱신 실패(폐기, 만료, 연결 해제) → 재로그인 필요 (`reauth`). BFF 가 세션을 지우고 401.
 */

import "server-only"

import { APIError } from "better-auth/api"

import { ACCOUNT_PROVIDER_ID, getAuth, type Auth } from "@/lib/auth/server"
import { createSingleFlight, expiresWithin } from "@/lib/auth/token-refresh"
import { authEnv } from "@/lib/env"
import { logger } from "@/lib/utils/logger"

/** 이보다 적게 남으면 미리 갱신 (백엔드 도착 전 만료와 시계 오차 대비). */
const REFRESH_MARGIN_MS = 60_000

export type BackendAuth =
  | { ok: true; headers: Record<string, string> }
  | { ok: false; status: 401; reauth: boolean }

interface StoredAccount {
  id: string
  providerId: string
  accessTokenExpiresAt?: Date | string | null
  refreshToken?: string | null
}

// dev HMR 로 모듈이 다시 평가돼도 대기 맵은 하나 (server.ts 의 커넥션 풀과 같은 이유).
const globalForRefresh = globalThis as unknown as {
  __ashfieldTokenSingleFlight?: ReturnType<typeof createSingleFlight<string>>
}
const singleFlight = (globalForRefresh.__ashfieldTokenSingleFlight ??= createSingleFlight<string>())

async function findAccountRow(a: Auth, userId: string): Promise<StoredAccount | undefined> {
  const ctx = await a.$context
  const rows = (await ctx.internalAdapter.findAccounts(userId)) as StoredAccount[]
  return rows.find((r) => r.providerId === ACCOUNT_PROVIDER_ID)
}

function expiresSoon(row: StoredAccount): boolean {
  return expiresWithin(row.accessTokenExpiresAt, REFRESH_MARGIN_MS)
}

class ReauthRequired extends Error {}

/** 저장된 토큰 (갱신 없이). */
async function storedToken(a: Auth, headers: Headers, accountId: string): Promise<string> {
  const res = await a.api.getAccessToken({ body: { accountId }, headers })
  if (!res.accessToken) throw new ReauthRequired("no access token")
  return res.accessToken
}

/** 계정당 한 번에 하나만: 들어와서 다시 읽고, 만료 임박이면 갱신, 아니면 저장된 토큰. */
function accountToken(a: Auth, headers: Headers, userId: string, accountId: string): Promise<string> {
  return singleFlight(accountId, async () => {
    const row = await findAccountRow(a, userId)
    if (!row) throw new ReauthRequired("account row gone")
    if (!expiresSoon(row)) return storedToken(a, headers, row.id)
    if (!row.refreshToken) throw new ReauthRequired("no refresh token")
    try {
      const res = await a.api.refreshToken({ body: { accountId: row.id }, headers })
      if (!res.accessToken) throw new ReauthRequired("refresh returned no access token")
      logger.debug("account_token_refreshed", { category: "auth" })
      return res.accessToken
    } catch (err) {
      if (err instanceof APIError && err.statusCode === 400) {
        logger.warn("account_token_refresh_failed", { category: "auth", detail: err.message })
        throw new ReauthRequired(err.message)
      }
      throw err
    }
  })
}

/** 이 요청(쿠키 포함 헤더)의 세션으로 백엔드용 Bearer 헤더를 만든다. */
export async function resolveBackendAuth(headers: Headers): Promise<BackendAuth> {
  const a = await getAuth()
  const session = await a.api.getSession({ headers })
  if (!session) return { ok: false, status: 401, reauth: false }

  try {
    const row = await findAccountRow(a, session.user.id)
    if (!row) throw new ReauthRequired("no account-server account")
    const token = await accountToken(a, headers, session.user.id, row.id)
    return { ok: true, headers: { Authorization: `Bearer ${token}` } }
  } catch (err) {
    if (err instanceof ReauthRequired) return { ok: false, status: 401, reauth: true }
    // getAccessToken 의 복호화와 조회 실패 등: 세션은 유효하나 토큰을 못 씀 → 재로그인.
    if (err instanceof APIError && (err.statusCode === 400 || err.statusCode === 401)) {
      return { ok: false, status: 401, reauth: true }
    }
    throw err
  }
}

/**
 * 재로그인 강제: Better Auth 세션을 지우는 Set-Cookie 헤더들을 돌려준다 (BFF 401 응답에 붙임).
 * 세션이 남아 있으면 /login 이 "이미 로그인됨" 으로 되돌려 보내 루프가 생긴다.
 */
export async function endSessionCookies(headers: Headers): Promise<string[]> {
  try {
    const a = await getAuth()
    const res = await a.api.signOut({
      headers,
      body: { disableRedirect: true },
      asResponse: true,
    })
    return res.headers.getSetCookie()
  } catch (err) {
    logger.warn("end_session_failed", { category: "auth", detail: (err as Error).message })
    return []
  }
}

/** 서버 컴포넌트용 세션 조회 (없으면 null). */
export async function getServerSession(headers: Headers) {
  return (await getAuth()).api.getSession({ headers })
}

let revocationEndpoint: string | null = null

/**
 * 로그아웃 때 이 앱의 refresh_token 을 계정 서버에서 폐기 (계약 §10). 실패해도 로그아웃은 진행.
 * 계정 서버 로그아웃은 앱 refresh_token 을 폐기하지 않으므로 앱이 직접 한다.
 */
export async function revokeAccountRefreshToken(userId: string): Promise<void> {
  try {
    const a = await getAuth()
    const row = await findAccountRow(a, userId)
    if (!row?.refreshToken) return
    if (!revocationEndpoint) {
      // 외부(계정 서버) 호출: 디스커버리 문서에서 revocation_endpoint 를 읽는다 (하드코딩 금지, 계약 §1).
      const disco = await fetch(`${authEnv.accountURL}/.well-known/openid-configuration`, {
        cache: "no-store",
      })
      revocationEndpoint = ((await disco.json()) as { revocation_endpoint?: string }).revocation_endpoint ?? null
      if (!revocationEndpoint) return
    }
    // 외부(계정 서버) 호출: RFC 7009 토큰 폐기, client_secret_basic.
    const res = await fetch(revocationEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${Buffer.from(`${authEnv.clientId}:${authEnv.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ token: row.refreshToken, token_type_hint: "refresh_token" }),
      cache: "no-store",
    })
    if (!res.ok) logger.warn("account_token_revoke_failed", { category: "auth", status: res.status })
  } catch (err) {
    logger.warn("account_token_revoke_failed", { category: "auth", detail: (err as Error).message })
  }
}
