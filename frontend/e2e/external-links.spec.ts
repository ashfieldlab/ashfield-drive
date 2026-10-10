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

    // 공유 모달 → 외부 링크 패널 → 링크 만들기
    await row.locator(`[data-testid$="-share"]`).click()
    await expect(page.getByTestId("share-modal")).toBeVisible()
    await page.getByTestId("link-create-button").click()

    // 활성 링크 카드의 URL: `/s/{token}` 형태 캡처
    await expect(page.getByTestId("share-link-card")).toBeVisible()
    await expect(page.getByTestId("share-link-toggle")).toHaveAttribute("aria-checked", "true")
    const tokenUrl = (await page.getByTestId("link-url").textContent()) ?? ""
    expect(tokenUrl).toMatch(/\/s\/[A-Za-z0-9_-]+$/)

    // 복사 버튼 → 복사됨
    await page.getByTestId("link-copy-button").click()
    await expect(page.getByTestId("link-copy-button")).toHaveText(/복사됨/)

    // 만료 변경은 URL 을 유지한다 (PATCH)
    await page.getByTestId("link-expiry-trigger").click()
    await page.getByTestId("link-expiry-7").click()
    await expect(page.getByTestId("link-expiry-trigger")).not.toHaveText(/없음/)
    await expect(page.getByTestId("link-url")).toHaveText(tokenUrl)
    await page.getByTestId("share-modal-close").click()
    // 목록 배지: 링크 공유
    await expect(row.locator(`[data-testid$="-link"]`)).toBeVisible()

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
