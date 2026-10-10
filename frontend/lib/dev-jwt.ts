/**
 * Dev JWT 발급: SKIP_AUTH 모드 전용, 서버 사이드 전용.
 *
 * dev-keys/private.pem 으로 RS256 서명, Keycloak 토큰과 같은 모양.
 * 백엔드가 SKIP_AUTH=true 면 dev-keys/public.pem 을 JWKS 에 넣으므로 그대로 검증된다.
 */

import "server-only"

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { SignJWT, importPKCS8 } from "jose"

import { DEV_TOKEN_TTL_SECONDS } from "@/lib/auth-session"
import type { DevUser } from "@/lib/dev-users"

const DEV_KEY_KID = "dev-key-2026"
const DEV_KEY_ISSUER = "dev-issuer"
const DEV_KEY_ALG = "RS256"

let cachedKey: Awaited<ReturnType<typeof importPKCS8>> | null = null

async function getDevPrivateKey() {
  if (cachedKey) return cachedKey
  const keyPath = resolve(
    process.cwd(),
    process.env.DEV_PRIVATE_KEY_PATH || "../dev-keys/private.pem",
  )
  cachedKey = await importPKCS8(readFileSync(keyPath, "utf-8"), DEV_KEY_ALG)
  return cachedKey
}

export async function signDevJwt(user: DevUser): Promise<string> {
  const key = await getDevPrivateKey()
  return new SignJWT({
    email: user.email,
    name: user.name,
    groups: user.companies,
    realm_access: { roles: user.roles },
    sid: crypto.randomUUID(),
  })
    .setProtectedHeader({ alg: DEV_KEY_ALG, kid: DEV_KEY_KID, typ: "JWT" })
    .setSubject(user.id)
    .setIssuer(DEV_KEY_ISSUER)
    // 백엔드 OIDC_AUDIENCE 가 비어 있으면 aud 검증을 건너뛴다(로컬 기본).
    .setAudience(process.env.OIDC_AUDIENCE || "ashfield")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + DEV_TOKEN_TTL_SECONDS)
    .sign(key)
}
