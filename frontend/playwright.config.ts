import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright config — SPEC §2.10.
 *
 * 전제:
 *   - backend 가 SKIP_AUTH=true 로 미리 떠 있어야 함 (`make backend`). 로그인은 dev-login.
 *   - PW_CHROMIUM_PATH: Playwright 가 OS 용 브라우저를 못 받는 환경(예: 최신 Ubuntu)에서
 *     이미 설치된 Chromium 실행 파일 경로를 지정. 없으면 Playwright 기본 브라우저.
 *   - infra(redis + postgres)도 미리 띄움 (`make infra`)
 *   - webServer가 frontend를 자동 부팅 (이미 떠 있으면 재사용)
 *
 * 실행:
 *   make e2e          — headless
 *   make e2e-ui       — UI 모드 (디버깅)
 */

const PORT = Number(process.env.PORT ?? 3000)

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // dev 사용자 공유 DB 상태 — 직렬 실행이 안전
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
