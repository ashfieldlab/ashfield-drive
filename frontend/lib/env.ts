/**
 * 환경 변수 접근 통일 — 무조건 이 파일을 거쳐서 읽음.
 *
 * NEXT_PUBLIC_* 만 클라이언트에 노출됨. 그 외 변수는 server-only 모듈에서만 import.
 */

// NEXT_PUBLIC_* envvar 가 빈 문자열일 때도 fallback 이 작동해야 하므로 `||`.
// `??` 면 빈 문자열을 통과시켜 timeout 0, appName 빈 문자열 같은 사고.
// (apiUrl 은 빈 값 자체가 의도된 default = same-origin BFF — `??` 유지)
export const env = {
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, ""),
  apiTimeoutMs: Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || 10_000),
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Ashfield",
  // 일정 앱(ashfield-calendar) origin. 헤더 크로스링크에 사용, 빈 값이면 숨김.
  // 예: https://calendar.example.com
  calendarUrl: (process.env.NEXT_PUBLIC_CALENDAR_URL || "").replace(/\/$/, ""),
}

// 쿠키 이름 namespace — 같은 localhost 에서 여러 앱이 cookie 충돌 안 나도록.
// 다운스트림은 .env 에 NEXT_PUBLIC_COOKIE_NS=<app-slug> 설정 (예: ashfield-drive).
// 정규식은 cookie 이름에 허용되는 문자만 (안전망).
//
// ⚠️ COOKIE_PREFIX 는 **개발 한정** 격리 장치다 (운영은 서비스마다 도메인이 분리돼 충돌 없음).
// Better Auth 세션 cookie 는 별도로 AUTH_COOKIE_PREFIX(아래, 운영에서도 앱 이름) 를 쓴다 —
// Better Auth 가 https 에서 `__Secure-` 를 앞에 붙이므로 하드닝과 양립한다.
//
// 규칙: 자체 cookie 정의 / 사용은 `@/lib/cookies` 로 통일.
const isDev = process.env.NODE_ENV !== "production"
const cookieNs = (process.env.NEXT_PUBLIC_COOKIE_NS || "ashfield-drive").replace(/[^a-z0-9_-]/gi, "")
export const COOKIE_PREFIX = isDev ? `${cookieNs}_` : ""

// -----------------------------------------------------------------------------
// 인증 (Better Auth = Ashfield 계정 서버의 OIDC 클라이언트): 서버 전용 값. 클라이언트 번들에선
// 전부 undefined 이므로 서버 코드(lib/auth/*, route handler, server component)에서만 읽는다. ADR-0024.
// -----------------------------------------------------------------------------

/** 이 앱의 OAuth client_id (계정 서버 `make seed` 가 등록). */
const DEFAULT_CLIENT_ID = "ashfield-drive"

export const authEnv = {
  /**
   * 이 앱의 공개 주소. OAuth 콜백(`${baseURL}/api/auth/callback/ashfield`)이자 계정 서버에 요청하는
   * resource(= 액세스 토큰 `aud`, 백엔드 AUTH_AUDIENCE).
   */
  get baseURL(): string {
    return (process.env.BETTER_AUTH_URL || "http://localhost:3200").replace(/\/$/, "")
  },
  /**
   * BETTER_AUTH_SECRET. `next build` 단계(이미지 빌드엔 비밀값이 없음)에서만 자리표시 값을 써서
   * Better Auth 의 "기본 secret" 오류를 피한다. 런타임(NEXT_PHASE≠build)엔 쓰이지 않는다 —
   * 운영에서 비어 있으면 Better Auth 가 거부한다.
   */
  get secret(): string | undefined {
    if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET
    if (authEnv.isBuildPhase) return "build-phase-placeholder-secret-not-used-at-runtime"
    return undefined
  },
  /** `next build` 실행 중 (DB·비밀값 없이 모듈만 평가되는 단계). */
  get isBuildPhase(): boolean {
    return process.env.NEXT_PHASE === "phase-production-build"
  },
  /** Better Auth 테이블이 있는 Postgres (스키마 `auth`). 백엔드와 같은 DB. */
  get databaseURL(): string {
    return process.env.DATABASE_URL || ""
  },
  /** Ashfield 계정 서버 주소 = OIDC issuer (끝 슬래시 없음). 디스커버리·회원 관리 링크의 기준. */
  get accountURL(): string {
    return (process.env.ACCOUNT_URL || "http://localhost:3300").replace(/\/$/, "")
  },
  /** 계정 서버에 등록된 이 앱의 client_id. */
  get clientId(): string {
    return process.env.ASHFIELD_CLIENT_ID || DEFAULT_CLIENT_ID
  },
  /** client_secret (계정 서버 `make seed` 출력 / `.secrets/clients.local.json`). */
  get clientSecret(): string {
    return process.env.ASHFIELD_CLIENT_SECRET || ""
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production"
  },
  /** 백엔드 주소 (BFF 가 호출). */
  get backendURL(): string {
    return (process.env.BACKEND_INTERNAL_URL || "http://localhost:8200").replace(/\/$/, "")
  },
}

/** Better Auth 쿠키 이름 prefix — 같은 localhost 의 다른 앱(drive 등)과 세션 쿠키가 섞이지 않게. */
export const AUTH_COOKIE_PREFIX = cookieNs
