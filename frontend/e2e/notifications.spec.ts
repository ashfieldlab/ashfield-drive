import { test, expect } from "./fixtures"
import { DEV_USERS } from "../lib/dev-users"

test.describe("notification bell", () => {
  test("공유받으면 unread 배지 +1, 패널 클릭하면 항목 노출", async ({
    page,
    loginAs,
  }) => {
    await loginAs("member_a")
    await page.goto("/dashboard")
    await page.context().clearCookies()

    await loginAs("admin")
    await page.goto("/files")
    const name = `알림-${Date.now()}`
    await page.getByTestId("files-new-folder-button").click()
    await page.getByTestId("files-new-folder-input").fill(name)
    await page.getByTestId("files-new-folder-confirm").click()
    const row = page.locator(`tr[data-testid^="files-row-"]`, { hasText: name })
    await row.locator(`[data-testid$="-share"]`).click()
    await page
      .getByTestId("share-grantee-input")
      .fill(DEV_USERS.member_a.email.split("@")[0])
    await page
      .getByTestId(`user-autocomplete-option-${DEV_USERS.member_a.id}`)
      .click()
    await page.getByTestId("share-add-button").click()
    await page.getByTestId("share-modal-close").click()

    // member_a 로 전환 → 헤더 벨 확인
    await page.context().clearCookies()
    await loginAs("member_a")
    await page.goto("/files")
    await expect(page.getByTestId("notification-unread-badge")).toBeVisible({
      timeout: 5_000,
    })
    await page.getByTestId("notification-bell").click()
    await expect(page.getByTestId("notification-panel")).toBeVisible()
    await expect(page.getByText(name).first()).toBeVisible()
  })
})
