/**
 * E2E 환경: 이 앱 고유 값은 여기만 (e2e/auth.ts·playwright.config.ts 는 Calendar 와 바이트 동일 유지).
 *
 *   PORT         이 앱 dev 서버 포트 (기본 3200)
 *   ACCOUNT_URL  Ashfield 계정 서버 (기본 http://localhost:3300, AUTH_DEV_PASSWORD_LOGIN=true 로 떠 있어야 함)
 */
export const APP_PORT = Number(process.env.PORT ?? 3200)
export const APP_URL = `http://localhost:${APP_PORT}`
export const ACCOUNT_URL = (process.env.ACCOUNT_URL ?? "http://localhost:3300").replace(/\/$/, "")
/** 이 앱 Postgres (Better Auth 스키마 `auth`): 토큰 갱신 E2E 가 저장된 토큰 만료를 조작한다. */
export const APP_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://ashfield:ashfield_dev@localhost:15532/ashfield_drive"
