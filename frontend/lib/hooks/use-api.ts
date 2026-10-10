/**
 * SWR 기반 GET 훅 + 캐시 무효화 헬퍼.
 *
 * 모든 클라이언트 GET은 useApiGet을 통해서. useSWR 직접 호출 금지 (CLAUDE.md 규칙).
 */

"use client"

import useSWR, { mutate, type SWRConfiguration } from "swr"

import { api, ApiError } from "@/lib/api-client"

const fetcher = async <T>(path: string) => api<T>(path)

export interface UseApiState<T> {
  data: T | undefined
  error: ApiError | undefined
  isLoading: boolean
  mutate: () => Promise<T | undefined>
}

export function useApiGet<T>(
  path: string | null,
  config?: SWRConfiguration<T, ApiError>,
): UseApiState<T> {
  const result = useSWR<T, ApiError>(path, fetcher, {
    // 4xx(403 권한·404 없음 등)는 재시도해도 안 풀림 → 재시도 중단(백엔드 스팸 방지).
    // 5xx·네트워크 오류만 백오프 재시도 (최대 5회). caller config 로 덮어쓰기 가능.
    onErrorRetry: (error, _key, _cfg, revalidate, { retryCount }) => {
      const status = (error as ApiError | undefined)?.status
      if (status !== undefined && status >= 400 && status < 500) return
      if (retryCount >= 5) return
      setTimeout(() => void revalidate({ retryCount }), 5000)
    },
    ...config,
  })
  return {
    data: result.data,
    error: result.error,
    isLoading: result.isLoading,
    mutate: () => result.mutate(),
  }
}

/**
 * 특정 prefix로 시작하는 SWR 캐시 일괄 무효화.
 * 예: invalidateApi("/api/v1/nodes"): nodes 관련 모든 키 재페치.
 */
export function invalidateApi(prefix: string): void {
  // 단어 경계 매칭: prefix 자체이거나 그 뒤에 / 또는 ? 가 와야 매치.
  // 미래에 `/api/v1/nodes-batch` 같은 라우트가 생겨도 우연히 무효화되지 않도록.
  //
  // 데이터를 비우지 않고 다시 받기만 한다(stale-while-revalidate). 비우면 그 데이터로 그린
  // 목록이 "불러오는 중"으로 바뀌며 목록 안에 띄운 창(공유·버전 등)까지 사라진다.
  void mutate((key) => {
    if (typeof key !== "string") return false
    if (key === prefix) return true
    return key.startsWith(prefix + "/") || key.startsWith(prefix + "?")
  })
}
