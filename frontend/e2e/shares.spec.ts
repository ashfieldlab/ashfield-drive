import { E2E_USERS, setActiveCompany, setupSharedWorkspace, signOut } from "./auth"
import { test, expect } from "./fixtures"

test.describe("file sharing", () => {
  test("Alice 가 Bob 에게 공유 → Bob 의 '공유받음' 에서 확인", async ({
    page,
    loginAs,
  }) => {
    // admin 의 공유 워크스페이스(계정 서버에서 생성·초대)에 member_a 가 들어온다.
    const { companyId, memberSub } = await setupSharedWorkspace(
      page,
      E2E_USERS.admin,
      E2E_USERS.member_a,
      `공유 팀 ${Date.now()}`,
    )
    await setActiveCompany(page, companyId)
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
      .fill(E2E_USERS.member_a.email.split("@")[0])
    await page.getByTestId(`user-autocomplete-option-${memberSub}`).click()
    await page.getByTestId("share-add-button").click()
    // 공유 row 노출
    await expect(
      page.locator(`[data-testid^="share-row-"]`).first(),
    ).toBeVisible()
    await page.getByTestId("share-modal-close").click()

    // member_a 로 전환 후 공유받음 확인
    await signOut(page)
    await setActiveCompany(page, companyId)
    await loginAs("member_a")
    await page.goto("/files?view=shared-with-me")
    await expect(
      page.locator(`tr[data-testid^="files-row-"]`, { hasText: name }),
    ).toBeVisible()
  })
})
