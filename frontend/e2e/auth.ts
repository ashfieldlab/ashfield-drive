/**
 * E2E 로그인 헬퍼: 실제 Ashfield 계정 서버를 거친다 (ADR-0024).
 *
 * 전제 (README "E2E"):
 *   - 계정 서버가 ACCOUNT_URL(기본 http://localhost:3300)에 AUTH_DEV_PASSWORD_LOGIN=true 로 떠 있고
 *     `make migrate seed` 완료: 이 앱의 client_secret 이 frontend/.env 의 ASHFIELD_CLIENT_SECRET.
 *   - 이 앱의 backend, infra.
 *
 * 로그인: 앱 /login → "Ashfield 계정으로 로그인" → 계정 서버 DEV 이메일+비밀번호 폼(처음 쓰는 이메일은
 * 가입 → 개인 워크스페이스 자동 생성) → 앱으로 복귀. 계정 서버에 이미 로그인돼 있으면 폼 없이 복귀(SSO).
 * 계정 서버와 앱이 모두 localhost 라 쿠키를 공유한다: clearCookies 는 둘 다 로그아웃시킨다.
 */

import { expect, type Page } from "@playwright/test"

import { COOKIES } from "../lib/cookies"
import { ACCOUNT_URL, APP_URL } from "./env"

export const BASE_URL = APP_URL

export interface E2EUser {
  email: string
  name: string
  password: string
}

const PASSWORD = "e2e-password-1234"

/** 고정 E2E 사용자 (계정 서버에 처음 로그인할 때 가입된다). */
export const E2E_USERS = {
  admin: { email: "e2e-admin@e2e.example.com", name: "관리자", password: PASSWORD },
  member_a: { email: "e2e-member-a@e2e.example.com", name: "멤버 A", password: PASSWORD },
  member_b: { email: "e2e-member-b@e2e.example.com", name: "멤버 B", password: PASSWORD },
} satisfies Record<string, E2EUser>

export type E2EUserKey = keyof typeof E2E_USERS

interface MeResponse {
  sub: string
  email: string
  groups: string[]
  workspaces: { id: string; name: string; account_workspace_id: string | null }[]
  workspace_roles: Record<string, string>
}

const onApp = (url: URL) => url.origin === APP_URL && !url.pathname.startsWith("/login")
const onAccountSignIn = (url: URL) => url.origin === ACCOUNT_URL && url.pathname === "/sign-in"

/** 계정 서버 DEV 비밀번호 폼 (처음 쓰는 이메일이면 가입). 현재 페이지가 계정 서버 /sign-in 이어야 한다. */
export async function fillAccountSignIn(page: Page, user: E2EUser): Promise<void> {
  await page.getByTestId("sign-in-dev-email-input").fill(user.email)
  await page.getByTestId("sign-in-dev-password-input").fill(user.password)
  await page.getByTestId("sign-in-dev-name-input").fill(user.name)
  await page.getByTestId("sign-in-dev-submit-button").click()
}

/**
 * 앱에 로그인. 계정 서버 세션이 없으면 비밀번호 폼을 채우고, 있으면 SSO 로 바로 돌아온다.
 * 반환값: 계정 서버 비밀번호 폼을 거쳤는지 (false = SSO).
 */
export async function signIn(page: Page, user: E2EUser): Promise<boolean> {
  await page.goto("/login")
  if (onApp(new URL(page.url()))) return false // 이미 앱 세션 있음
  await expect(page.getByTestId("login-ashfield-button"), "계정 서버 연결 (ACCOUNT_URL)").toBeVisible()
  await page.getByTestId("login-ashfield-button").click()
  // dev 서버 첫 컴파일이 느릴 수 있어 넉넉히.
  await page.waitForURL((u) => onApp(u) || onAccountSignIn(u), { timeout: 30_000 })
  let usedPassword = false
  if (onAccountSignIn(new URL(page.url()))) {
    await fillAccountSignIn(page, user)
    usedPassword = true
  }
  await page.waitForURL(onApp, { timeout: 30_000 })
  return usedPassword
}

/** 앱 세션만 끝낸다 (계정 서버 세션 유지 → 다음 signIn 은 SSO). 새 토큰(워크스페이스 반영)을 받을 때. */
export async function signOutAppOnly(page: Page): Promise<void> {
  await page.request.post("/api/auth/sign-out", {
    headers: { origin: BASE_URL },
    data: { disableRedirect: true },
  })
}

/** 앱과 계정 서버 모두 로그아웃 (사용자 전환용). */
export async function signOut(page: Page): Promise<void> {
  await signOutAppOnly(page)
  await page.context().clearCookies()
}

/** 현재 로그인 사용자의 /api/v1/me. */
export async function me(page: Page): Promise<MeResponse> {
  const res = await page.request.get("/api/v1/me")
  expect(res.ok(), `GET /api/v1/me: ${res.status()}`).toBeTruthy()
  return (await res.json()) as MeResponse
}

/** 현재 사용자의 개인 워크스페이스 ID (계정 서버가 가입 때 만든 "{이름}의 워크스페이스"). */
export async function personalWorkspaceId(page: Page, user: E2EUser): Promise<string> {
  const body = await me(page)
  const c = body.workspaces.find((x) => x.name === `${user.name}의 워크스페이스`)
  expect(c, "personal workspace").toBeTruthy()
  return c!.id
}

/**
 * 계정 서버에서 새 워크스페이스 + 초대 링크를 만든다 (현재 브라우저의 계정 서버 세션 = 소유자).
 * 반환: 워크스페이스 ID(= 앱 워크스페이스 ID)와 초대 URL. 앱에 반영하려면 새 토큰이 필요하다 (재로그인).
 */
export async function createWorkspaceWithInvite(
  page: Page,
  name: string,
): Promise<{ id: string; inviteUrl: string }> {
  await page.goto(`${ACCOUNT_URL}/workspaces`)
  await page.getByTestId("workspaces-create-button").click()
  await page.getByTestId("workspaces-create-name-input").fill(name)
  await page.getByTestId("workspaces-create-submit-button").click()
  await page.waitForURL(/\/workspaces\/[^/]+$/)
  const id = decodeURIComponent(new URL(page.url()).pathname.split("/").pop()!)
  await page.getByTestId("invite-create-button").click()
  const urlInput = page.locator('[data-testid^="invite-link-"][data-testid$="-url-input"]').first()
  await expect(urlInput).toBeVisible()
  return { id, inviteUrl: await urlInput.inputValue() }
}

/** 초대 링크 수락: 계정 서버 세션이 없으면 user 로 로그인(가입)부터. */
export async function acceptInvite(page: Page, inviteUrl: string, user: E2EUser): Promise<void> {
  await page.goto(inviteUrl)
  if (onAccountSignIn(new URL(page.url()))) await fillAccountSignIn(page, user)
  await page.waitForURL(/\/invite\//)
  const accept = page.getByTestId("invite-accept-button")
  const already = page.getByTestId("invite-already-member")
  await expect(accept.or(already)).toBeVisible()
  if (await accept.isVisible()) {
    await accept.click()
    await page.waitForURL(/\/workspaces\/[^/]+$/)
  }
}

/**
 * 공유 워크스페이스 준비: owner 가 계정 서버에 워크스페이스 + 초대 링크를 만들고, member 가 수락한 뒤
 * 둘 다 앱에 다시 로그인한다 (새 토큰의 workspaces 로 앱 멤버십이 생긴다). 끝나면 owner 로 로그인된 상태.
 */
export async function setupSharedWorkspace(
  page: Page,
  owner: E2EUser,
  member: E2EUser,
  name: string,
): Promise<{ workspaceId: string; memberSub: string }> {
  await signOut(page)
  await signIn(page, owner)
  const { id, inviteUrl } = await createWorkspaceWithInvite(page, name)
  await signOut(page)

  await acceptInvite(page, inviteUrl, member)
  await signIn(page, member) // 계정 서버 세션이 있어 SSO
  const memberMe = await me(page)
  expect(memberMe.groups).toContain(id)
  expect(memberMe.workspace_roles[id]).toBe("member")
  await signOut(page)

  await signIn(page, owner)
  expect((await me(page)).workspace_roles[id]).toBe("admin") // owner → admin
  return { workspaceId: id, memberSub: memberMe.sub }
}

/** 활성 워크스페이스 cookie 를 고정 (AppContext 가 다음 로드 때 이 워크스페이스를 고른다). */
export async function setActiveWorkspace(page: Page, workspaceId: string): Promise<void> {
  await page.context().addCookies([
    { name: COOKIES.activeWorkspace, value: encodeURIComponent(workspaceId), url: BASE_URL },
  ])
}
