/**
 * BFF 의 계정 서버 토큰 갱신 (ADR-0024): 저장된 액세스 토큰 만료를 DB 에서 앞당겨 확인한다.
 *   - 만료 임박 → refresh_token 으로 갱신 (새 토큰 저장), 동시 요청이 몰려도 갱신은 한 번
 *     (계정 서버의 refresh 재사용 감지에 걸리면 전부 401 이 된다). 만료 직전에 시작된 요청도 포함
 *   - 갱신 실패 → 401 + 앱 세션 삭제 → /login 이 다시 계정 서버로 보낸다
 */
import { Pool } from "pg"

import { E2E_USERS, me, signIn } from "./auth"
import { APP_DATABASE_URL } from "./env"
import { test, expect } from "./fixtures"

const pool = new Pool({ connectionString: APP_DATABASE_URL, max: 2 })
test.afterAll(async () => pool.end())

async function accountRow(email: string) {
  const { rows } = await pool.query(
    `select a.id, a."accessToken" as access, a."refreshToken" as refresh
       from auth.account a join auth."user" u on u.id = a."userId"
      where u.email = $1 and a."providerId" = 'ashfield'`,
    [email],
  )
  expect(rows, "ashfield account row").toHaveLength(1)
  return rows[0] as { id: string; access: string; refresh: string }
}

async function expireAccessToken(accountId: string, refresh?: string) {
  await pool.query(
    `update auth.account set "accessTokenExpiresAt" = now() - interval '1 minute'
       ${refresh ? `, "refreshToken" = $2` : ""} where id = $1`,
    refresh ? [accountId, refresh] : [accountId],
  )
}

test("만료 임박 토큰은 BFF 가 갱신한다: 동시 요청도 한 번만", async ({ page }) => {
  const user = E2E_USERS.member_b
  await signIn(page, user)
  await me(page)
  const before = await accountRow(user.email)

  // 만료 시점을 가로지르는 요청 흐름: 이미 진행 중인 요청(로그인 직후 페이지가 보내는 것과 같은)도
  // 갱신을 따로 일으키면 안 된다.
  const pending: Promise<number>[] = []
  for (let i = 0; i < 20; i++) {
    if (i === 8) await expireAccessToken(before.id)
    pending.push(page.request.get("/api/v1/me").then((r) => r.status()))
    await new Promise((r) => setTimeout(r, 3))
  }
  const results = await Promise.all(pending)
  expect(results.filter((s) => s !== 200)).toEqual([])

  const after = await accountRow(user.email)
  expect(after.access).not.toBe(before.access)
  expect(after.refresh).not.toBe(before.refresh) // 회전된 새 refresh_token 저장

  // 회전 후에도 계속 갱신 가능 (토큰 패밀리가 폐기되지 않았다)
  await expireAccessToken(after.id)
  expect((await page.request.get("/api/v1/me")).status()).toBe(200)
})

test("갱신 실패면 401 + 앱 세션 삭제 → 다시 로그인", async ({ page }) => {
  const user = E2E_USERS.member_b
  await signIn(page, user)
  await me(page)
  const row = await accountRow(user.email)

  await expireAccessToken(row.id, "revoked-or-garbage-refresh-token")
  const res = await page.request.get("/api/v1/me")
  expect(res.status()).toBe(401)

  // 앱 세션은 지워졌지만 계정 서버 세션은 살아 있어 /login 이 SSO 로 바로 복귀 (리다이렉트 루프 없음)
  expect(await signIn(page, user)).toBe(false)
  expect((await page.request.get("/api/v1/me")).status()).toBe(200)
})
