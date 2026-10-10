/**
 * Better Auth 서버 인스턴스: 로그인·세션의 단일 출처 (ADR-0024).
 *
 * 이 앱의 Better Auth 는 **Ashfield 계정 서버(OIDC 제공자)의 클라이언트**일 뿐이다.
 * 로그인 수단(Google·GitHub·DEV 비밀번호)·가입 허용·워크스페이스는 계정 서버가 맡는다.
 *
 *   - 핸들러: app/api/auth/[...all]/route.ts (`/api/auth/*`). 콜백 `/api/auth/callback/ashfield`.
 *   - DB: 백엔드와 같은 Postgres, 테이블은 별도 스키마 `auth` (Alembic 은 무시).
 *     테이블 생성은 Better Auth CLI — `make auth-migrate`.
 *   - genericOAuth provider `ashfield`: 디스커버리, client_secret_basic + PKCE,
 *     scope `openid profile email offline_access`, 모든 토큰 요청에 `resource=<이 앱 URL>`
 *     (그래야 액세스 토큰이 백엔드가 JWKS 로 검증할 수 있는 JWT 로 나온다: 계약 §3).
 *   - 계정 서버가 준 액세스·리프레시·ID 토큰은 Better Auth `account` 테이블에 저장되고,
 *     BFF 가 액세스 토큰을 백엔드에 Bearer 로 넘긴다 (lib/auth/session.ts).
 *
 * 디스커버리는 인스턴스 초기화 때 한 번 받는다. 그때 계정 서버가 꺼져 있었으면 provider 가
 * 빠진 채 뜨므로, `getAuth()` 가 provider 가 없는 인스턴스를 (10초에 한 번까지) 다시 만든다.
 *
 * Better Auth CLI 가 이 파일을 직접 읽으므로 "server-only"·경로 별칭(@/)을 쓰지 않는다.
 * 서버 코드에서만 import 할 것.
 */

import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { genericOAuth } from "better-auth/plugins/generic-oauth"
import { PostgresDialect } from "kysely"
import { Pool } from "pg"

import { AUTH_COOKIE_PREFIX, authEnv, env } from "../env"
import { logger } from "../utils/logger"

/** Better Auth 테이블 스키마. backend/alembic/env.py 의 EXCLUDED_SCHEMAS 와 같아야 한다. */
export const AUTH_DB_SCHEMA = "auth"

/** genericOAuth provider id: 콜백 경로·account.providerId 에 쓰인다. 계정 서버 redirect_uri 와 짝. */
export const ACCOUNT_PROVIDER_ID = "ashfield"

/** 계약(ADR-0001 §3)의 scope: offline_access 가 있어야 refresh_token 이 나온다. */
const ACCOUNT_SCOPES = ["openid", "profile", "email", "offline_access"]

/** 디스커버리 실패 인스턴스를 다시 만드는 최소 간격. */
const REBUILD_INTERVAL_MS = 10_000

// dev HMR 로 모듈이 다시 평가돼도 커넥션 풀은 하나만.
const globalForPool = globalThis as unknown as { __ashfieldAuthPool?: Pool }
const pool =
  globalForPool.__ashfieldAuthPool ??
  new Pool({ connectionString: authEnv.databaseURL, max: 5 })
if (!authEnv.isProduction) globalForPool.__ashfieldAuthPool = pool

function accountProvider() {
  const resource = { resource: authEnv.baseURL }
  // `next build` 단계엔 계정 서버가 없을 수 있다: 디스커버리 대신 자리표시 엔드포인트 (런타임엔 안 쓰임).
  const endpoints = authEnv.isBuildPhase
    ? {
        authorizationUrl: `${authEnv.accountURL}/api/auth/oauth2/authorize`,
        tokenUrl: `${authEnv.accountURL}/api/auth/oauth2/token`,
      }
    : {
        discoveryUrl: `${authEnv.accountURL}/.well-known/openid-configuration`,
        // id_token 서명·iss·aud·nonce 검증에 필요한 issuer·jwks 가 디스커버리에 없으면 provider 를 띄우지 않는다.
        requireIdTokenVerification: true,
      }
  return genericOAuth({
    config: [
      {
        providerId: ACCOUNT_PROVIDER_ID,
        name: "Ashfield 계정",
        ...endpoints,
        clientId: authEnv.clientId,
        clientSecret: authEnv.clientSecret || undefined,
        tokenEndpointAuth: { method: "client_secret_basic" as const },
        pkce: true,
        scopes: ACCOUNT_SCOPES,
        authorizationUrlParams: resource,
        tokenUrlParams: resource,
        refreshTokenParams: resource,
        // 계정 서버가 원천: 로그인할 때마다 이름·사진을 계정 서버 값으로.
        overrideUserInfo: true,
        // RP-initiated logout 후 돌아올 곳 (계정 서버에 등록된 post_logout_redirect_uri 와 일치).
        postLogoutRedirectURI: `${authEnv.baseURL}/login`,
      },
    ],
  })
}

function createAuth() {
  return betterAuth({
    appName: env.appName,
    baseURL: authEnv.baseURL,
    secret: authEnv.secret,
    database: {
      dialect: new PostgresDialect({ pool }),
      type: "postgres",
      schemaName: AUTH_DB_SCHEMA,
    },
    // 로컬 이메일·비밀번호 로그인 없음: 계정 서버만.
    emailAndPassword: { enabled: false },
    account: {
      // 예전 앱 내부 로그인(Google·GitHub)으로 만든 같은 이메일 사용자에 계정 서버 계정을 연결.
      accountLinking: { enabled: true, trustedProviders: [ACCOUNT_PROVIDER_ID] },
    },
    advanced: {
      cookiePrefix: AUTH_COOKIE_PREFIX,
      // 스키마 검증(누락 시 "make auth-migrate" 안내)은 런타임에만: 빌드 단계엔 DB 가 없다.
      database: { validateSchema: !authEnv.isBuildPhase },
    },
    plugins: [
      accountProvider(),
      // server action 에서 auth.api.* 가 심는 쿠키를 Next 응답에 반영 (반드시 마지막).
      nextCookies(),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>

/** Better Auth CLI(`make auth-migrate`)가 읽는 인스턴스. 앱 코드는 `getAuth()` 를 쓸 것. */
export const auth = createAuth()

if (!authEnv.clientSecret && !authEnv.isBuildPhase) {
  logger.error("account_client_secret_missing", {
    category: "auth",
    detail: "ASHFIELD_CLIENT_SECRET 이 비어 있습니다: 계정 서버 `make seed` 출력값을 넣으세요.",
  })
}

let current = { instance: auth, builtAt: Date.now(), ready: false }

/** 계정 서버 provider 가 등록됐는지 (디스커버리 성공). */
async function hasAccountProvider(instance: Auth): Promise<boolean> {
  const ctx = await instance.$context
  return ctx.socialProviders.some((p) => p.id === ACCOUNT_PROVIDER_ID)
}

/**
 * 앱 코드용 Better Auth 인스턴스. 시작할 때 계정 서버 디스커버리에 실패했으면
 * (계정 서버가 나중에 떴을 때) 인스턴스를 다시 만들어 provider 를 살린다.
 */
export async function getAuth(): Promise<Auth> {
  if (current.ready) return current.instance
  if (await hasAccountProvider(current.instance)) {
    current.ready = true
    return current.instance
  }
  if (Date.now() - current.builtAt >= REBUILD_INTERVAL_MS) {
    logger.warn("account_discovery_retry", { category: "auth", accountURL: authEnv.accountURL })
    current = { instance: createAuth(), builtAt: Date.now(), ready: false }
    current.ready = await hasAccountProvider(current.instance)
  }
  return current.instance
}

/** 로그인 화면용: 계정 서버에 연결돼 provider 가 준비됐는지. */
export async function isAccountProviderReady(): Promise<boolean> {
  return hasAccountProvider(await getAuth())
}

export type Session = Auth["$Infer"]["Session"]
