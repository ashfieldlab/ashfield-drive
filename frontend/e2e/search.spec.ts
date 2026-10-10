import { createFolder, test, expect } from "./fixtures"

test.describe("global search", () => {
  test("폴더 생성 후 검색바로 매칭 → 클릭 시 /files 로 이동", async ({
    page,
    loginAs,
  }) => {
    await loginAs("member_a")
    await page.goto("/files")
    const term = `srch${Date.now()}`
    const name = `${term}-folder`

    await createFolder(page, name)

    // 헤더 검색
    await page.getByTestId("global-search-input").fill(term)
    await expect(page.getByTestId("global-search-results")).toBeVisible({
      timeout: 5000,
    })
    const hit = page.locator(`[data-testid^="global-search-node-"]`, {
      hasText: name,
    })
    await expect(hit).toBeVisible()
    await hit.click()
    await expect(page).toHaveURL(/\/files/)
  })

  test("결과 없는 검색어는 '결과가 없습니다' 표시", async ({ page, loginAs }) => {
    await loginAs("member_a")
    await page.goto("/files")
    await page.getByTestId("global-search-input").fill("zzzz-no-match-xxx-9999")
    await expect(page.getByText("결과가 없습니다.")).toBeVisible({
      timeout: 3000,
    })
  })
})
