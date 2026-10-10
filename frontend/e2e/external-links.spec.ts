import { test, expect } from "./fixtures"

test.describe("external links", () => {
  test("파일 업로드 → 외부 링크 생성 → 인증 없이 /s/[token] 접근", async ({
    page,
    browser,
    loginAs,
  }) => {
    await loginAs("member_a")
    await page.goto("/files")

    const name = `ext-${Date.now()}.txt`
    const fileInput = page.getByTestId("files-upload-input")
    await fileInput.setInputFiles({
      name,
      mimeType: "text/plain",
      buffer: Buffer.from("hello external"),
    })
    const row = page.locator(`tr[data-testid^="files-row-"]`, { hasText: name })
    await expect(row).toBeVisible({ timeout: 10_000 })

    // 공유 모달 → 외부 링크 탭 → 생성
    await row.locator(`[data-testid$="-share"]`).click()
    await page.getByTestId("share-tab-links").click()
    await page.getByTestId("link-create-button").click()

    // 첫 활성 링크의 URL 텍스트 — `/s/{token}` 형태 캡처
    const linkRow = page.locator(`li[data-testid^="link-row-"]`).first()
    await expect(linkRow).toBeVisible()
    const tokenUrl = await linkRow.locator(`[data-testid$="-url"]`).innerText()
    expect(tokenUrl).toMatch(/\/s\/[A-Za-z0-9_-]+$/)

    // 새 컨텍스트(인증 없음)로 접근
    const anonCtx = await browser.newContext()
    const anonPage = await anonCtx.newPage()
    const path = tokenUrl.replace(/^.*\/s\//, "/s/")
    await anonPage.goto(path)
    await expect(anonPage.getByTestId("external-link-page")).toBeVisible()
    await expect(
      anonPage.getByTestId("external-link-download-button"),
    ).toBeEnabled()
    await anonCtx.close()
  })
})
