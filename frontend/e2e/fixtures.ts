/**
 * E2E 공통 fixtures.
 *
 *   - loginAs("admin" | "member_a" | "member_b"): Better Auth dev 비밀번호 로그인 후 앱 첫 화면
 *     (e2e/auth.ts — 프론트가 AUTH_DEV_PASSWORD_LOGIN=true 로 떠 있어야 함)
 */

import { test as base, expect, type Page } from "@playwright/test"

import { APP } from "../lib/apps"
import { E2E_USERS, signIn, type E2EUserKey } from "./auth"

export const test = base.extend<{
  loginAs: (key: E2EUserKey) => Promise<void>
}>({
  loginAs: async ({ page }, use) => {
    const fn = async (key: E2EUserKey) => {
      await loginAs(page, key)
    }
    await use(fn)
  },
})

export { expect }

/** E2E 사용자로 로그인하고 앱 첫 화면으로 이동. */
export async function loginAs(page: Page, key: E2EUserKey): Promise<void> {
  await signIn(page, E2E_USERS[key])
  await page.goto(APP.home)
  await page.waitForLoadState("networkidle")
}

/**
 * 앱 확인 창(useConfirm — components/ui-custom/use-confirm.tsx)의 확인 버튼을 누른다.
 */
export async function confirmDialog(page: Page): Promise<void> {
  await page.getByTestId("confirm-dialog-confirm").click()
}
