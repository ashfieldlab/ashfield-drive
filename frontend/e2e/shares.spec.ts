import { E2E_USERS, setActiveWorkspace, setupSharedWorkspace, signOut } from "./auth"
import { test, expect } from "./fixtures"

test.describe("file sharing", () => {
  test("Alice 가 Bob 에게 공유 → Bob 의 '공유받음' 에서 확인", async ({
    page,
    loginAs,
  }) => {
    // admin 의 공유 워크스페이스(계정 서버에서 생성과 초대)에 member_a 가 들어온다.
    const { workspaceId, memberSub } = await setupSharedWorkspace(
      page,
      E2E_USERS.admin,
      E2E_USERS.member_a,
      `공유 팀 ${Date.now()}`,
    )
    await setActiveWorkspace(page, workspaceId)
    await page.goto("/files")
    const name = `공유-${Date.now()}`

    // 폴더 생성: "새로 만들기" 메뉴 안에 있으면 메뉴부터 연다
    const newMenu = page.getByTestId("files-new-button")
    const newFolder = page.getByTestId("files-new-folder-button")
    await expect(newMenu.or(newFolder).first()).toBeVisible()
    if (await newMenu.isVisible()) await newMenu.click()
    await page.getByTestId("files-new-folder-button").click()
    await page.getByTestId("files-new-folder-input").fill(name)
    await page.getByTestId("files-new-folder-confirm").click()

    const row = page.locator(`tr[data-testid^="files-row-"]`, { hasText: name })
    await expect(row).toBeVisible()

    // 공유 버튼 → 모달 → 콤보박스에서 member_a 검색과 선택
    await row.locator(`[data-testid$="-share"]`).click()
    await expect(page.getByTestId("share-modal")).toBeVisible()
    await page
      .getByTestId("share-grantee-input")
      .fill(E2E_USERS.member_a.email.split("@")[0])
    await page.getByTestId(`user-autocomplete-option-${memberSub}`).click()
    await expect(page.getByTestId(`share-staged-${memberSub}`)).toBeVisible()
    await page.getByTestId("share-add-button").click()
    // 공유 row 노출 (보기)
    const shareRow = page.locator(`li[data-testid^="share-row-"]`).first()
    await expect(shareRow).toBeVisible()
    const shareRowId = (await shareRow.getAttribute("data-testid"))!
    const permTrigger = page.getByTestId(`${shareRowId}-perm-trigger`)
    await expect(permTrigger).toHaveText(/보기/)

    // 권한 변경: 보기 → 편집 (upsert)
    await permTrigger.click()
    await page.getByTestId(`${shareRowId}-perm-write`).click()
    await expect(permTrigger).toHaveText(/편집/)
    await page.getByTestId("share-modal-close").click()

    // member_a 로 전환 후 공유받음 확인
    await signOut(page)
    await setActiveWorkspace(page, workspaceId)
    await loginAs("member_a")
    await page.goto("/files?view=shared-with-me")
    await expect(
      page.locator(`tr[data-testid^="files-row-"]`, { hasText: name }),
    ).toBeVisible()
  })
})
