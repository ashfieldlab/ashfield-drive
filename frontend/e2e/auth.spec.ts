import { APP } from "../lib/apps"
import { me } from "./auth"
import { test, expect } from "./fixtures"

test.describe("인증 (Better Auth)", () => {
  test("비로그인으로 보호 페이지 접근 → /login 으로 (복귀 주소 보존)", async ({ page }) => {
    await page.goto("/settings")
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fsettings/)
    await expect(page.getByTestId("login-page")).toBeVisible()
    await expect(page.getByTestId("login-dev-form")).toBeVisible()
  })

  test("처음 로그인하면 개인 워크스페이스가 생기고, 로그아웃하면 /login 으로", async ({ page }) => {
    const email = `e2e-new-${Date.now()}@e2e.example.com`

    await page.goto("/login")
    await page.getByTestId("login-dev-email-input").fill(email)
    await page.getByTestId("login-dev-password-input").fill("e2e-password-1234")
    await page.getByTestId("login-dev-name-input").fill("새사용자")
    await page.getByTestId("login-dev-submit-button").click()

    // dev 서버 첫 컴파일이 느릴 수 있어 넉넉히.
    await expect(page).toHaveURL(new RegExp(`${APP.home}`), { timeout: 30_000 })
    await expect(page.getByTestId("protected-main")).toBeVisible({ timeout: 30_000 })

    const body = await me(page)
    expect(body.email).toBe(email)
    expect(body.companies).toEqual([
      { id: `personal-${body.sub}`, name: "새사용자의 워크스페이스" },
    ])
    expect(body.company_roles[`personal-${body.sub}`]).toBe("admin")

    await page.getByTestId("user-menu-trigger").click()
    await page.getByTestId("user-menu-logout").click()
    await expect(page).toHaveURL(/\/login/)

    // 세션이 끝났으므로 API 도 401
    const res = await page.request.get("/api/v1/me")
    expect(res.status()).toBe(401)
  })
})
