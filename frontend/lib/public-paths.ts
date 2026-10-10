/**
 * 로그인 없이 여는 공개 페이지: 외부 공유 링크(/s).
 *
 * 공개 페이지에서도 앱 셸이 /api/v1/me 를 부르는데, 그 401 로 로그인 화면에 보내면 외부인이
 * 페이지를 못 본다. api-client 의 401 처리가 이 목록을 보고 건너뛴다.
 * proxy.ts 의 matcher 제외 목록과 같이 맞춘다 (matcher 는 정적 문자열이라 여기서 못 가져간다).
 */
const PUBLIC_PREFIXES = ["/s/", "/login"]

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p))
}
