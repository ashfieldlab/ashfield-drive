import { APP } from "../lib/apps"
import { ACCOUNT_URL } from "./env"
import {
  createWorkspaceWithInvite,
  fillAccountSignIn,
  me,
  personalWorkspaceId,
  signIn,
  signOutAppOnly,
} from "./auth"
import { test, expect } from "./fixtures"

test.describe("인증 (Ashfield 계정 서버 SSO)", () => {
  test("비로그인으로 보호 페이지 접근 → /login 이 바로 계정 서버로", async ({ page }) => {
    await page.goto("/settings")
    await page.waitForURL((u) => u.origin === ACCOUNT_URL && u.pathname === "/sign-in", { timeout: 30_000 })
  })

  test("오류로 돌아온 /login 은 자동으로 가지 않고 버튼을 보여 준다", async ({ page }) => {
    await page.goto("/login?error=access_denied")
    await expect(page.getByTestId("login-error-alert")).toBeVisible()
    await expect(page.getByTestId("login-ashfield-button")).toBeEnabled()
    await expect(page).toHaveURL(/\/login\?error=access_denied/)
  })

  test("계정 서버 가입과 로그인 → 앱 복귀, 개인 워크스페이스 동기화, 로그아웃은 계정 서버까지", async ({
    page,
  }) => {
    const user = {
      email: `e2e-new-${Date.now()}@e2e.example.com`,
      name: "새사용자",
      password: "e2e-password-1234",
    }

    // 복귀 주소를 들고 계정 서버로 갔다가 돌아온다.
    await page.goto("/settings")
    await page.waitForURL((u) => u.origin === ACCOUNT_URL && u.pathname === "/sign-in", { timeout: 30_000 })
    await fillAccountSignIn(page, user)
    await expect(page).toHaveURL(/\/settings$/, { timeout: 30_000 })
    await expect(page.getByTestId("protected-main")).toBeVisible({ timeout: 30_000 })

    // 계정 서버가 가입 때 만든 개인 워크스페이스가 토큰 workspaces 클레임으로 들어와 있다.
    const body = await me(page)
    expect(body.email).toBe(user.email)
    const personal = await personalWorkspaceId(page, user)
    expect(body.workspaces).toEqual([
      { id: personal, name: "새사용자의 워크스페이스", account_workspace_id: personal },
    ])
    expect(body.workspace_roles[personal]).toBe("admin") // owner → admin

    // 계정 서버에서 워크스페이스를 만들면 다음 토큰(재로그인)에 반영된다: SSO 라 비밀번호 폼 없음.
    const team = await createWorkspaceWithInvite(page, `E2E 팀 ${Date.now()}`)
    await signOutAppOnly(page)
    expect(await signIn(page, user)).toBe(false)
    const after = await me(page)
    expect(after.groups).toEqual(expect.arrayContaining([personal, team.id]))
    expect(after.workspace_roles[team.id]).toBe("admin")

    // 멤버 화면: 관리 링크가 계정 서버 워크스페이스로
    await page.goto(`/settings/workspace/${encodeURIComponent(team.id)}/members`)
    await expect(page.getByTestId("workspace-members-manage-link")).toHaveAttribute(
      "href",
      `${ACCOUNT_URL}/workspaces/${encodeURIComponent(team.id)}`,
    )

    // 로그아웃 → 계정 서버 end-session → /login → 계정 서버 세션도 끝나 로그인 화면(SSO 로 바로 돌아오지 않음).
    await page.goto(APP.home)
    await page.getByTestId("user-menu-trigger").click()
    await page.getByTestId("user-menu-logout").click()
    await page.waitForURL((u) => u.origin === ACCOUNT_URL && u.pathname === "/sign-in", { timeout: 30_000 })
    expect((await page.request.get("/api/v1/me")).status()).toBe(401)
  })
})
