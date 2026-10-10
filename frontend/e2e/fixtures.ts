/**
 * E2E 공통 fixtures.
 *
 *   - loginAs(page, "admin" | "member_a" | ...): /api/auth/dev-login 으로 dev 로그인 (ADR-0021)
 *   - cleanup(page): 로그아웃
 *
 * SKIP_AUTH=true 환경에서만 동작. 백엔드도 동일 모드로 떠 있어야 dev JWT가 검증됨.
 */

import { test as base, expect, type Page } from "@playwright/test"

import { APP } from "../lib/apps"
import { DEV_USERS } from "../lib/dev-users"

type DevUserKey = keyof typeof DEV_USERS

export const test = base.extend<{
  loginAs: (key: DevUserKey) => Promise<void>
}>({
  loginAs: async ({ page }, use) => {
    const fn = async (key: DevUserKey) => {
      await loginAs(page, key)
    }
    await use(fn)
  },
})

export { expect }


/**
 * dev 사용자 로그인 (SKIP_AUTH 모드). dev-login 이 dev_token 쿠키를 심고 앱 첫 화면으로 보낸다.
 */
export async function loginAs(page: Page, key: DevUserKey): Promise<void> {
  await page.goto(`/api/auth/dev-login?u=${key}&redirect=${encodeURIComponent(APP.home)}`)
  await page.waitForLoadState("networkidle")
}

/**
 * 앱 확인 창(useConfirm — components/ui-custom/use-confirm.tsx)의 확인 버튼을 누른다.
 */
export async function confirmDialog(page: Page): Promise<void> {
  await page.getByTestId("confirm-dialog-confirm").click()
}
