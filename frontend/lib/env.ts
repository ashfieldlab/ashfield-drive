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
// ⚠️ prefix 는 **개발 한정** 격리 장치다. 운영에선 prefix 를 떼고 빈 문자열:
//   - 운영은 서비스마다 도메인이 분리돼 cookie 충돌이 자연 해소됨.
//   - dev(http://localhost)는 `__Secure-`/`__Host-` cookie 를 못 쓰므로(비-secure)
//     평문 prefix 가 유일한 격리 수단. 반대로 운영(https)은 NextAuth 가 자동으로
//     `__Secure-`/`__Host-` 를 붙이는데, prefix 를 박으면 그 이름 규칙과 양립 불가라
//     하드닝을 잃는다. 그래서 운영에선 prefix 를 떼고 NextAuth 기본값을 살린다.
//     (NextAuth cookies 의 운영/개발 분기는 auth.ts 참고.)
//
// 규칙: 이 앱에서 set 하는 *모든* cookie (자체 + NextAuth) 이름 앞에 COOKIE_PREFIX
// 를 붙인다. 단일 source. cookie 정의 / 사용은 `@/lib/cookies` 로 통일.
const isDev = process.env.NODE_ENV !== "production"
const cookieNs = (process.env.NEXT_PUBLIC_COOKIE_NS || "ashfield-drive").replace(/[^a-z0-9_-]/gi, "")
export const COOKIE_PREFIX = isDev ? `${cookieNs}_` : ""
