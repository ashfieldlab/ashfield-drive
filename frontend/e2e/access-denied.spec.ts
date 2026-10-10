import { test, expect } from "./fixtures"

test.describe("access denied", () => {
  test("빈 groups 사용자는 자동으로 /access-denied 로 이동", async ({
    page,
    loginAs,
  }) => {
    await loginAs("no_company")
    // 보호된 페이지에 가도 access-denied 로 자동 리다이렉트
    await page.goto("/files")
    await expect(page).toHaveURL(/\/access-denied$/, { timeout: 5000 })
    await expect(page.getByTestId("access-denied-page")).toBeVisible()
    await expect(page.getByTestId("access-denied-relogin")).toBeVisible()
  })
})
