/**
 * E2E 로그인 헬퍼 — Better Auth 이메일+비밀번호 dev 로그인 (ADR-0023).
 *
 * 전제: 프론트가 AUTH_DEV_PASSWORD_LOGIN=true (비운영)로 떠 있어야 한다. 처음 쓰는 이메일은
 * 가입(자동 로그인)한다 — 첫 /api/v1/me 에서 백엔드가 개인 워크스페이스를 만든다.
 * DB 는 실행 사이에 유지되므로 두 번째 실행부터는 그냥 로그인된다.
 */

import { expect, type Page } from "@playwright/test"

import { COOKIES } from "../lib/cookies"

export const BASE_URL = `http://localhost:${process.env.PORT ?? 3000}`

export interface E2EUser {
  email: string
  name: string
  password: string
}

const PASSWORD = "e2e-password-1234"

/** 고정 E2E 사용자. 회사는 각자 개인 워크스페이스 + 테스트가 필요할 때 addMember 로 공유. */
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
  companies: { id: string; name: string }[]
  company_roles: Record<string, string>
}

/** 이메일+비밀번호로 로그인 (없으면 가입). 브라우저 컨텍스트에 세션 쿠키가 남는다. */
export async function signIn(page: Page, user: E2EUser): Promise<void> {
  const headers = { origin: BASE_URL }
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email: user.email, password: user.password },
    headers,
  })
  if (res.status() === 401) {
    const up = await page.request.post("/api/auth/sign-up/email", {
      data: { email: user.email, password: user.password, name: user.name },
      headers,
    })
    expect(up.ok(), `sign-up ${user.email}: ${await up.text()}`).toBeTruthy()
    return
  }
  expect(res.ok(), `sign-in ${user.email}: ${await res.text()}`).toBeTruthy()
}

/** 로그아웃 + 쿠키 비우기 (사용자 전환용). */
export async function signOut(page: Page): Promise<void> {
  await page.request.post("/api/auth/sign-out", { headers: { origin: BASE_URL }, data: {} })
  await page.context().clearCookies()
}

/** 현재 로그인 사용자의 /api/v1/me (첫 호출이면 개인 워크스페이스 생성). */
export async function me(page: Page): Promise<MeResponse> {
  const res = await page.request.get("/api/v1/me")
  expect(res.ok(), `GET /api/v1/me: ${res.status()}`).toBeTruthy()
  return (await res.json()) as MeResponse
}

/** 현재 사용자의 개인 워크스페이스 ID (role=admin 인 personal-* 회사). */
export async function personalCompanyId(page: Page): Promise<string> {
  const body = await me(page)
  const id = body.groups.find((g) => g === `personal-${body.sub}`)
  expect(id, "personal workspace").toBeTruthy()
  return id!
}

/** 현재 사용자(회사 admin)가 company 에 email 사용자를 멤버로 추가. 이미 멤버면 통과. */
export async function addMember(page: Page, companyId: string, email: string): Promise<void> {
  const res = await page.request.post(
    `/api/v1/companies/${encodeURIComponent(companyId)}/members`,
    { data: { email }, headers: { origin: BASE_URL } },
  )
  expect([201, 409], `add member ${email}: ${await res.text()}`).toContain(res.status())
}

/** 활성 회사 cookie 를 고정 (AppContext 가 다음 로드 때 이 회사를 고른다). */
export async function setActiveCompany(page: Page, companyId: string): Promise<void> {
  await page.context().addCookies([
    { name: COOKIES.activeCompany, value: encodeURIComponent(companyId), url: BASE_URL },
  ])
}
