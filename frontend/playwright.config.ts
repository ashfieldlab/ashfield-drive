import { defineConfig, devices } from "@playwright/test"

import { APP_PORT } from "./e2e/env"

/**
 * Playwright config: SPEC §2.10. 실제 Ashfield 계정 서버로 로그인한다 (ADR-0024).
 *
 * 전제 (README "E2E"):
 *   - 계정 서버(ashfield-account): `make infra migrate seed && make dev` → http://localhost:3300,
 *     .env 에 AUTH_DEV_PASSWORD_LOGIN=true. 다른 주소면 ACCOUNT_URL.
 *   - 이 앱: infra + migrate + auth-migrate + backend 기동, frontend/.env 에 ASHFIELD_CLIENT_SECRET
 *     (계정 서버 .secrets/clients.local.json). 앱 포트는 PORT (기본값 e2e/env.ts).
 *   - PW_CHROMIUM_PATH: Playwright 가 OS 용 브라우저를 못 받는 환경(예: 최신 Ubuntu)에서
 *     이미 설치된 Chromium 실행 파일 경로를 지정. 없으면 Playwright 기본 브라우저.
 *   - webServer 가 frontend 를 자동 부팅 (이미 떠 있으면 재사용)
 *
 * 실행:
 *   make e2e         : headless
 *   make e2e-ui      : UI 모드 (디버깅)
 */

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false, // 계정 서버·dev DB 상태 공유: 직렬 실행이 안전
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: `http://localhost:${APP_PORT}`,
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
    command: `PORT=${APP_PORT} npm run dev`,
    url: `http://localhost:${APP_PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
