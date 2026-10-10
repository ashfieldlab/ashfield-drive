import { confirmDialog, createFolder, test, expect } from "./fixtures"

const rowOf = (page: import("@playwright/test").Page, name: string) =>
  page.locator(`tr[data-testid^="files-row-"]`, { hasText: name })

test.describe("/files", () => {
  test("폴더 생성 → 행 메뉴로 삭제 → 휴지통에서 복원", async ({ page, loginAs }) => {
    await loginAs("member_a")
    await page.goto("/files")
    await expect(page.getByTestId("files-page")).toBeVisible()

    const name = `폴더-${Date.now()}`
    await createFolder(page, name)

    const row = rowOf(page, name)
    await expect(row).toBeVisible({ timeout: 5000 })

    // 행 메뉴 → 삭제 → 앱 확인 창
    await row.hover()
    await row.locator(`[data-testid$="-menu"]`).click()
    await page.getByTestId("files-menu-delete").click()
    await confirmDialog(page)
    await expect(rowOf(page, name)).toHaveCount(0)

    // 휴지통: 남은 기간 표시, 복원
    await page.getByTestId("nav-link-files-trash").click()
    const trashRow = rowOf(page, name)
    await expect(trashRow).toBeVisible()
    await expect(trashRow.locator(`[data-testid$="-days-left"]`)).toContainText("30일")
    await expect(trashRow.locator(`[data-testid$="-origin"]`)).toContainText("내 파일")
    await trashRow.hover()
    await trashRow.locator(`[data-testid$="-restore"]`).click()
    await expect(rowOf(page, name)).toHaveCount(0)

    await page.getByTestId("nav-link-files-personal").click()
    await expect(rowOf(page, name)).toBeVisible()
  })

  test("휴지통 선택 복원과 비우기 확인 막대", async ({ page, loginAs }) => {
    await loginAs("member_a")
    await page.goto("/files")
    const a = `선택A-${Date.now()}`
    const b = `선택B-${Date.now()}`
    await createFolder(page, a)
    await expect(rowOf(page, a)).toBeVisible()
    await createFolder(page, b)
    await expect(rowOf(page, b)).toBeVisible()

    // 다중 선택 → 일괄 삭제
    for (const n of [a, b]) {
      await rowOf(page, n).hover()
      await rowOf(page, n).locator(`[data-testid$="-select"]`).click()
    }
    await expect(page.getByTestId("files-bulk-bar")).toContainText("2개 선택")
    await page.getByTestId("files-bulk-delete").click()
    await confirmDialog(page)
    await expect(rowOf(page, a)).toHaveCount(0)
    await expect(rowOf(page, b)).toHaveCount(0)

    await page.goto("/files?trash=1")
    await expect(rowOf(page, a)).toBeVisible()
    await rowOf(page, a).click()
    await rowOf(page, b).click()
    await expect(page.getByTestId("files-bulk-bar")).toContainText("2개 선택")

    // 비우기는 확인 막대만 열고 취소 (다른 테스트 데이터 보존)
    await page.getByTestId("files-trash-empty-button").click()
    await expect(page.getByTestId("files-trash-empty-confirm-bar")).toBeVisible()
    await page.getByTestId("files-trash-empty-cancel").click()

    await page.getByTestId("files-bulk-restore").click()
    await expect(rowOf(page, a)).toHaveCount(0)
    await expect(rowOf(page, b)).toHaveCount(0)
    await page.goto("/files")
    await expect(rowOf(page, a)).toBeVisible()
    await expect(rowOf(page, b)).toBeVisible()
  })

  test("업로드: 목록 안 진행 → 새 항목 + 사이드바 표시, 보기 전환 기억", async ({ page, loginAs }) => {
    await loginAs("member_a")
    await page.goto("/files")
    const name = `up-${Date.now()}.txt`
    await page.getByTestId("files-upload-input").setInputFiles({
      name,
      mimeType: "text/plain",
      buffer: Buffer.from("hello upload"),
    })
    const row = rowOf(page, name)
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row.locator(`[data-testid$="-new"]`)).toBeVisible()

    // 사이드바: 끝나면 "업로드 완료", 팝오버에 목적지 폴더
    await expect(page.getByTestId("upload-indicator-title")).toHaveText("업로드 완료")
    await page.getByTestId("upload-indicator-button").click()
    await expect(page.getByTestId("upload-indicator-popover")).toContainText("내 파일")
    await page.getByTestId("upload-indicator-clear").click()
    await expect(page.getByTestId("upload-indicator-button")).toHaveCount(0)

    // 갤러리로 바꾸면 새로고침해도 유지
    await page.getByTestId("files-view-grid").click()
    await expect(page.getByTestId("files-gallery")).toBeVisible()
    await page.reload()
    await expect(page.getByTestId("files-gallery")).toBeVisible()
    await expect(page.locator(`[data-testid^="files-row-"]`, { hasText: name }).first()).toBeVisible()
    await page.getByTestId("files-view-list").click()
    await expect(page.getByTestId("files-tree")).toBeVisible()
  })

  test("워크스페이스 격리: member_a 가 만든 폴더를 member_b 는 못 본다", async ({
    page,
    loginAs,
  }) => {
    await loginAs("member_a")
    await page.goto("/files")
    const name = `격리-${Date.now()}`
    await createFolder(page, name)
    await expect(rowOf(page, name)).toBeVisible()

    // 로그아웃 후 다른 워크스페이스 사용자
    await page.context().clearCookies()
    await loginAs("member_b")
    await page.goto("/files")
    await expect(page.getByTestId("files-page")).toBeVisible()
    await expect(rowOf(page, name)).toHaveCount(0)
  })
})
