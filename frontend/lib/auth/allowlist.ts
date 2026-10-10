/**
 * ALLOWED_EMAILS 해석 — 쉼표 구분, 공백·대소문자 무시.
 * 빈 목록이면 누구나 허용 (공개 가입). 순수 함수라 단위 테스트 대상.
 */

export function parseEmailList(raw: string | undefined | null): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isEmailAllowed(
  email: string | undefined | null,
  allowlist: Set<string>,
): boolean {
  if (allowlist.size === 0) return true
  if (!email) return false
  return allowlist.has(email.trim().toLowerCase())
}
