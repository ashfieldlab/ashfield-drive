import { APP } from "../lib/apps"
import { test, expect } from "./fixtures"

// 사용자 메뉴 "테마": next-themes 가 html 에 .dark 를 붙이고 localStorage 에 남긴다. (Drive 와 바이트 동일)
test.describe("theme", () => {
  test.use({ colorScheme: "light" })

  test("시스템 기본, 다크 선택은 새로고침 후에도 유지, 시스템으로 복귀", async ({ page, loginAs }) => {
    await loginAs("member_a")
    const html = page.locator("html")
    await expect(html).not.toHaveClass(/\bdark\b/)

    await page.getByTestId("user-menu-trigger").click()
    await page.getByTestId("user-menu-theme").click()
    await page.getByTestId("user-menu-theme-dark").click()
    await expect(html).toHaveClass(/\bdark\b/)

    await page.reload()
    await expect(html).toHaveClass(/\bdark\b/)

    await page.getByTestId("user-menu-trigger").click()
    await page.getByTestId("user-menu-theme").click()
    await page.getByTestId("user-menu-theme-system").click()
    await expect(html).not.toHaveClass(/\bdark\b/)

    await page.emulateMedia({ colorScheme: "dark" })
    await page.goto(APP.home)
    await expect(html).toHaveClass(/\bdark\b/)
  })
})
