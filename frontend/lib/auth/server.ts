/**
 * Better Auth 서버 인스턴스 — 로그인·세션의 단일 출처 (ADR-0023).
 *
 *   - 핸들러: app/api/auth/[...all]/route.ts (`/api/auth/*`).
 *   - DB: 백엔드와 같은 Postgres, 테이블은 별도 스키마 `auth` (Alembic 은 무시).
 *     테이블 생성은 Better Auth CLI — `make auth-migrate`.
 *   - 소셜 로그인: Google·GitHub. CLIENT_ID/SECRET 이 둘 다 있을 때만 켠다.
 *   - ALLOWED_EMAILS: 비어 있지 않으면 목록 밖 이메일의 가입·로그인을 서버에서 거부.
 *   - JWT 플러그인: BFF 가 세션으로 짧은 JWT(RS256)를 받아 백엔드에 Bearer 로 넘기고,
 *     백엔드는 `/api/auth/jwks` 로 검증한다.
 *   - AUTH_DEV_PASSWORD_LOGIN=true: 로컬·E2E 전용 이메일+비밀번호. 운영(NODE_ENV=production)에선 무시.
 *
 * Better Auth CLI 가 이 파일을 직접 읽으므로 "server-only"·경로 별칭(@/)을 쓰지 않는다.
 * 서버 코드에서만 import 할 것.
 */

import { betterAuth, type BetterAuthOptions } from "better-auth"
import { APIError } from "better-auth/api"
import { nextCookies } from "better-auth/next-js"
import { jwt } from "better-auth/plugins/jwt"
import { PostgresDialect } from "kysely"
import { Pool } from "pg"

import { AUTH_COOKIE_PREFIX, authEnv, env } from "../env"
import { logger } from "../utils/logger"
import { isEmailAllowed, parseEmailList } from "./allowlist"

/** Better Auth 테이블 스키마. backend/alembic/env.py 의 EXCLUDED_SCHEMAS 와 같아야 한다. */
export const AUTH_DB_SCHEMA = "auth"

/** BFF → 백엔드 JWT 수명. 짧게: 로그아웃 후 이미 발급된 토큰이 살아 있는 상한. */
const BACKEND_JWT_TTL = "5m"

// dev HMR 로 모듈이 다시 평가돼도 커넥션 풀은 하나만.
const globalForPool = globalThis as unknown as { __ashfieldAuthPool?: Pool }
const pool =
  globalForPool.__ashfieldAuthPool ??
  new Pool({ connectionString: authEnv.databaseURL, max: 5 })
if (!authEnv.isProduction) globalForPool.__ashfieldAuthPool = pool

const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {}
if (authEnv.googleClientId && authEnv.googleClientSecret) {
  socialProviders.google = {
    clientId: authEnv.googleClientId,
    clientSecret: authEnv.googleClientSecret,
  }
}
if (authEnv.githubClientId && authEnv.githubClientSecret) {
  socialProviders.github = {
    clientId: authEnv.githubClientId,
    clientSecret: authEnv.githubClientSecret,
  }
}

/** 로그인 화면이 버튼을 그릴 제공자 (설정된 것만). */
export const enabledSocialProviders = Object.keys(socialProviders) as ("google" | "github")[]

/** 이메일+비밀번호 dev 로그인 — 명시 플래그 + 비운영일 때만. */
export const devPasswordLoginEnabled =
  authEnv.devPasswordLoginRequested && !authEnv.isProduction

if (authEnv.devPasswordLoginRequested && authEnv.isProduction) {
  // 운영에서 켜려는 시도는 거부(비활성 유지)하고 크게 남긴다.
  logger.error("dev_password_login_refused_in_production", {
    category: "auth",
    detail: "AUTH_DEV_PASSWORD_LOGIN=true 는 NODE_ENV=production 에서 무시됩니다.",
  })
}

const allowlist = parseEmailList(authEnv.allowedEmails)

export const auth = betterAuth({
  appName: env.appName,
  baseURL: authEnv.baseURL,
  secret: authEnv.secret,
  database: {
    dialect: new PostgresDialect({ pool }),
    type: "postgres",
    schemaName: AUTH_DB_SCHEMA,
  },
  socialProviders,
  emailAndPassword: {
    enabled: devPasswordLoginEnabled,
    autoSignIn: true,
  },
  user: {
    // 가입(create-user)·계정 연결·OAuth 재로그인 시점의 이메일 검사.
    validateUserInfo: ({ user }) => {
      if (!isEmailAllowed(user.email, allowlist)) {
        return {
          error: "email_not_allowed",
          errorDescription: "허용되지 않은 이메일입니다.",
        }
      }
    },
  },
  databaseHooks: {
    session: {
      create: {
        // 비밀번호 재로그인처럼 validateUserInfo 를 안 타는 경로까지 — 세션 발급 직전에 한 번 더.
        before: async (session, ctx) => {
          if (allowlist.size === 0) return
          const user = await ctx?.context.internalAdapter.findUserById(session.userId)
          if (!user || !isEmailAllowed(user.email, allowlist)) {
            throw new APIError("FORBIDDEN", {
              code: "EMAIL_NOT_ALLOWED",
              message: "허용되지 않은 이메일입니다.",
            })
          }
        },
      },
    },
  },
  advanced: {
    cookiePrefix: AUTH_COOKIE_PREFIX,
    // 스키마 검증(누락 시 "make auth-migrate" 안내)은 런타임에만 — 빌드 단계엔 DB 가 없다.
    database: { validateSchema: !authEnv.isBuildPhase },
  },
  plugins: [
    jwt({
      // 백엔드(python-jose)가 RS256 으로 검증 — 기본값 EdDSA 대신 RSA 키.
      jwks: { keyPairConfig: { alg: "RS256", modulusLength: 2048 } },
      jwt: {
        issuer: authEnv.baseURL,
        audience: authEnv.baseURL,
        expirationTime: BACKEND_JWT_TTL,
        definePayload: ({ user }) => ({
          email: user.email,
          name: user.name,
          image: user.image ?? null,
          email_verified: user.emailVerified,
        }),
      },
      // get-session 응답에 JWT 헤더를 싣지 않는다 — 토큰은 BFF 가 서버에서만 받는다.
      disableSettingJwtHeader: true,
    }),
    // server action 에서 auth.api.* 가 심는 쿠키를 Next 응답에 반영 (반드시 마지막).
    nextCookies(),
  ],
})

export type Session = typeof auth.$Infer.Session
