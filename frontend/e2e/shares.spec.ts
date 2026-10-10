import { test, expect } from "./fixtures"
import { DEV_USERS } from "../lib/dev-users"

test.describe("file sharing", () => {
  test("Alice 가 Bob 에게 공유 → Bob 의 '공유받음' 에서 확인", async ({
    page,
    loginAs,
  }) => {
    // member_a 가 콤보박스 후보로 잡히려면 한 번 /me 호출되어 캐시에 등록되어야 함
    await loginAs("member_a")
    await page.goto("/dashboard")
    await page.context().clearCookies()

    await loginAs("admin") // companies=tenant-a,tenant-b 공유 가능
    await page.goto("/files")
    const name = `공유-${Date.now()}`

    // 폴더 생성
    await page.getByTestId("files-new-folder-button").click()
    await page.getByTestId("files-new-folder-input").fill(name)
    await page.getByTestId("files-new-folder-confirm").click()

    const row = page.locator(`tr[data-testid^="files-row-"]`, { hasText: name })
    await expect(row).toBeVisible()

    // 공유 버튼 → 모달 → 콤보박스에서 member_a 검색·선택
    await row.locator(`[data-testid$="-share"]`).click()
    await expect(page.getByTestId("share-modal")).toBeVisible()
    await page
      .getByTestId("share-grantee-input")
      .fill(DEV_USERS.member_a.email.split("@")[0])
    await page
      .getByTestId(`user-autocomplete-option-${DEV_USERS.member_a.id}`)
      .click()
    await page.getByTestId("share-add-button").click()
    // 공유 row 노출
    await expect(
      page.locator(`[data-testid^="share-row-"]`).first(),
    ).toBeVisible()
    await page.getByTestId("share-modal-close").click()

    // member_a 로 전환 후 공유받음 확인
    await page.context().clearCookies()
    await loginAs("member_a")
    await page.goto("/files?view=shared-with-me")
    await expect(
      page.locator(`tr[data-testid^="files-row-"]`, { hasText: name }),
    ).toBeVisible()
  })
})
