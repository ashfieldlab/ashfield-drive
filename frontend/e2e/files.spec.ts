import { confirmDialog, test, expect } from "./fixtures"

test.describe("/files", () => {
  test("폴더 생성 → 트리 표시 → 삭제 → 휴지통 복원", async ({ page, loginAs }) => {
    await loginAs("member_a")
    await page.goto("/files")
    await expect(page.getByTestId("files-page")).toBeVisible()

    const name = `폴더-${Date.now()}`

    // 새 폴더 모달
    await page.getByTestId("files-new-folder-button").click()
    await page.getByTestId("files-new-folder-input").fill(name)
    await page.getByTestId("files-new-folder-confirm").click()

    // 리스트에 노출
    const row = page.locator(`tr[data-testid^="files-row-"]`, { hasText: name })
    await expect(row).toBeVisible({ timeout: 5000 })

    // 삭제 → 앱 확인 창에서 확인
    await row.locator(`[data-testid$="-delete"]`).click()
    await confirmDialog(page)
    await expect(
      page.locator(`tr[data-testid^="files-row-"]`, { hasText: name }),
    ).toHaveCount(0)

    // 휴지통에서 보이고, 복원
    await page.getByTestId("nav-link-files-trash").click()
    const trashRow = page.locator(`tr[data-testid^="files-row-"]`, {
      hasText: name,
    })
    await expect(trashRow).toBeVisible()
    await trashRow.locator(`[data-testid$="-restore"]`).click()

    await page.getByTestId("nav-link-files-personal").click()
    await expect(
      page.locator(`tr[data-testid^="files-row-"]`, { hasText: name }),
    ).toBeVisible()
  })

  test("회사 격리: member_a 가 만든 폴더를 member_b 는 못 본다", async ({
    page,
    loginAs,
  }) => {
    await loginAs("member_a")
    await page.goto("/files")
    const name = `격리-${Date.now()}`
    await page.getByTestId("files-new-folder-button").click()
    await page.getByTestId("files-new-folder-input").fill(name)
    await page.getByTestId("files-new-folder-confirm").click()
    await expect(
      page.locator(`tr[data-testid^="files-row-"]`, { hasText: name }),
    ).toBeVisible()

    // 로그아웃 후 다른 회사 사용자
    await page.context().clearCookies()
    await loginAs("member_b")
    await page.goto("/files")
    await expect(page.getByTestId("files-page")).toBeVisible()
    await expect(
      page.locator(`tr[data-testid^="files-row-"]`, { hasText: name }),
    ).toHaveCount(0)
  })
})
