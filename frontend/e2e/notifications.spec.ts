import { E2E_USERS, setActiveWorkspace, setupSharedWorkspace, signOut } from "./auth"
import { test, expect } from "./fixtures"

test.describe("notification bell", () => {
  test("공유받으면 unread 배지 +1, 패널 클릭하면 항목 노출", async ({
    page,
    loginAs,
  }) => {
    // admin 의 공유 워크스페이스(계정 서버에서 생성·초대)에 member_a 가 들어온다.
    const { workspaceId, memberSub } = await setupSharedWorkspace(
      page,
      E2E_USERS.admin,
      E2E_USERS.member_a,
      `알림 팀 ${Date.now()}`,
    )
    await setActiveWorkspace(page, workspaceId)
    await page.goto("/files")
    const name = `알림-${Date.now()}`
    await page.getByTestId("files-new-folder-button").click()
    await page.getByTestId("files-new-folder-input").fill(name)
    await page.getByTestId("files-new-folder-confirm").click()
    const row = page.locator(`tr[data-testid^="files-row-"]`, { hasText: name })
    await row.locator(`[data-testid$="-share"]`).click()
    await page
      .getByTestId("share-grantee-input")
      .fill(E2E_USERS.member_a.email.split("@")[0])
    await page.getByTestId(`user-autocomplete-option-${memberSub}`).click()
    await page.getByTestId("share-add-button").click()
    await page.getByTestId("share-modal-close").click()

    // member_a 로 전환 → 헤더 벨 확인
    await signOut(page)
    await setActiveWorkspace(page, workspaceId)
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
