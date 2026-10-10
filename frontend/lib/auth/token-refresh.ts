/**
 * 계정 서버 토큰 갱신의 순수 로직: lib/auth/session.ts 가 쓴다 (단위 테스트 대상).
 *
 * 계정 서버는 refresh_token 을 회전시키고 재사용을 감지하면 토큰 패밀리를 통째로 폐기한다
 * (계약 §7). 같은 계정의 갱신이 동시에 두 번 나가면 두 번째가 "재사용" 으로 잡혀 사용자가
 * 로그아웃되므로, 같은 키의 작업은 하나만 돌리고 나머지는 그 결과를 기다린다.
 */

/** 만료까지 marginMs 보다 적게 남았는지. 만료 시각을 모르면 false (갱신 안 함). */
export function expiresWithin(
  expiresAt: Date | string | null | undefined,
  marginMs: number,
  now: number = Date.now(),
): boolean {
  if (!expiresAt) return false
  const t = new Date(expiresAt).getTime()
  if (Number.isNaN(t)) return false
  return t - now < marginMs
}

/** 키마다 진행 중인 작업 하나. 끝나면(성공 또는 실패) 비운다: 다음 호출은 새로 돈다. */
export function createSingleFlight<T>() {
  const inflight = new Map<string, Promise<T>>()
  return function run(key: string, task: () => Promise<T>): Promise<T> {
    const running = inflight.get(key)
    if (running) return running
    const p = task().finally(() => inflight.delete(key))
    inflight.set(key, p)
    return p
  }
}
