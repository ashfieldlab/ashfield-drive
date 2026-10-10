"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { usePathname, useRouter } from "next/navigation"
import { mutate } from "swr"

import { COOKIES, COOKIE_DOMAIN } from "@/lib/cookies"
import { useApiGet } from "@/lib/hooks/use-api"
import { logger } from "@/lib/utils/logger"

// -----------------------------------------------------------------------------
// 타입
// -----------------------------------------------------------------------------

export interface AuthUser {
  id: string
  email: string
  name?: string | null
  roles: string[]
}

export interface AppContextType {
  authUser: AuthUser | null
  bootstrapped: boolean

  // 멀티테넌트 (로컬 DB 소속: /api/v1/me groups)
  companies: string[]
  /** 회사 ID → 표시 이름 (개인 워크스페이스 등). 없으면 ID 를 그대로 표시. */
  companyNames: Record<string, string>
  activeCompanyId: string | null
  setActiveCompany: (id: string) => void

  // 권한 헬퍼
  isSystemAdmin: boolean
  /** 활성 회사의 admin 여부. System Admin 은 자동 true (ADR-0010). */
  isCompanyAdmin: boolean
}

/**
 * `/api/v1/me`: 신원·회사·권한의 단일 출처.
 * BFF 가 Better Auth 세션으로 JWT 를 받아 백엔드에 넘기고, 백엔드가 검증한 신원 + 로컬 DB 소속을 반환.
 * 브라우저 JS 엔 토큰이 없으므로 여기서 신원을 얻는다.
 */
interface MeResponse {
  sub: string
  email: string
  name: string | null
  image?: string | null
  groups: string[]
  companies?: { id: string; name: string }[]
  roles: string[]
  is_system_admin: boolean
  company_roles: Record<string, "admin" | "member">
}

const AppContext = createContext<AppContextType | null>(null)

// -----------------------------------------------------------------------------
// 쿠키 헬퍼: 활성 회사 영속화
// -----------------------------------------------------------------------------

function readActiveCompanyCookie(): string | null {
  if (typeof document === "undefined") return null
  const m = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${COOKIES.activeCompany}=([^;]+)`),
  )
  return m ? decodeURIComponent(m[1]) : null
}

function writeActiveCompanyCookie(id: string): void {
  if (typeof document === "undefined") return
  const maxAge = 60 * 60 * 24 * 30 // 30일
  const parts = [
    `${COOKIES.activeCompany}=${encodeURIComponent(id)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
  ]
  // 운영: 부모 도메인 지정 시 서브도메인 간 공유 (cross-service active company sync).
  if (COOKIE_DOMAIN) parts.push(`Domain=${COOKIE_DOMAIN}`)
  // https 에서만 Secure (localhost dev 는 http 라 제외).
  if (typeof location !== "undefined" && location.protocol === "https:") {
    parts.push("Secure")
  }
  document.cookie = parts.join("; ")
}

// -----------------------------------------------------------------------------
// Cross-tab 동기화: BroadcastChannel
//
// 같은 origin 의 다른 탭에서 active company 가 바뀌면 이 탭도 따라가야 한다.
// 그러지 않으면 셀렉트 표시(이 탭)와 fetcher 가 읽는 cookie(다른 탭이 갱신) 가
// 엇갈려 "보고 있는 회사" 와 "실제 들어가는 회사" 가 달라지는 사고가 난다.
// -----------------------------------------------------------------------------

const COMPANY_CHANNEL_NAME = "ashfield:active-company"

function createCompanyChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
    return null
  }
  return new BroadcastChannel(COMPANY_CHANNEL_NAME)
}

// -----------------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------------

interface AppProviderProps {
  children: ReactNode
}

export function AppProvider({ children }: AppProviderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null)
  const [bootstrapped, setBootstrapped] = useState(false)
  const channelRef = useRef<BroadcastChannel | null>(null)

  // 신원·회사·권한 = 백엔드가 검증한 /me.
  const { data: me } = useApiGet<MeResponse>("/api/v1/me")

  const companies: string[] = useMemo(() => me?.groups ?? [], [me])
  const companyNames: Record<string, string> = useMemo(
    () => Object.fromEntries((me?.companies ?? []).map((c) => [c.id, c.name])),
    [me],
  )

  const authUser: AuthUser | null = useMemo(() => {
    if (!me) return null
    return { id: me.sub, email: me.email, name: me.name, roles: me.roles }
  }, [me])

  // 부트스트랩: /me 로딩 끝나고 active company 결정
  useEffect(() => {
    if (!me) return // 로딩 중

    if (companies.length === 0) {
      setActiveCompanyIdState(null)
      setBootstrapped(true)
      // 인증은 됐으나 회사 배정이 없는 계정 → access-denied.
      // /s/(공유 링크)는 redirect 금지.
      if (
        pathname &&
        !pathname.startsWith("/access-denied") &&
        !pathname.startsWith("/s/")
      ) {
        router.replace("/access-denied")
      }
      return
    }

    const stored = readActiveCompanyCookie()
    const initial =
      stored && companies.includes(stored) ? stored : companies[0]
    setActiveCompanyIdState(initial)
    if (initial !== stored) writeActiveCompanyCookie(initial)
    setBootstrapped(true)

    logger.info("app_bootstrapped", {
      category: "auth",
      user: me.sub,
      companies: companies.length,
      active: initial,
    })
  }, [me, companies, pathname, router])

  const setActiveCompany = useCallback((id: string) => {
    if (!companies.includes(id)) {
      logger.warn("active_company_not_in_groups", {
        category: "auth",
        requested: id,
        available: companies,
      })
      return
    }
    setActiveCompanyIdState(id)
    writeActiveCompanyCookie(id)
    // 같은 origin 의 다른 탭들에 회사 변경 통지 → 그쪽도 따라 바뀜
    channelRef.current?.postMessage({ id })
    // 회사 바뀌면 모든 SWR 캐시 무효화 → 새 X-Active-Company-Id로 자동 refetch.
    // queueMicrotask 로 한 tick 미뤄 cookie set 이 안정된 뒤 refetch: race 최소화.
    queueMicrotask(() => {
      void mutate(() => true, undefined, { revalidate: true })
    })
  }, [companies])

  // 다른 탭에서 온 회사 변경 메시지 수신: state·cookie 동기화 후 전체 refetch.
  useEffect(() => {
    const channel = createCompanyChannel()
    channelRef.current = channel
    if (!channel) return

    const handler = (e: MessageEvent<{ id?: string }>) => {
      const id = e.data?.id
      if (!id || !companies.includes(id) || id === activeCompanyId) return
      setActiveCompanyIdState(id)
      writeActiveCompanyCookie(id)
      queueMicrotask(() => {
        void mutate(() => true, undefined, { revalidate: true })
      })
      logger.info("active_company_synced_from_tab", {
        category: "auth",
        active: id,
      })
    }

    channel.addEventListener("message", handler)
    return () => {
      channel.removeEventListener("message", handler)
      channel.close()
      channelRef.current = null
    }
  }, [companies, activeCompanyId])

  // Cross-service 동기화: 부모 도메인 공유 cookie + 탭 포커스 재읽기.
  // 다른 서비스(예: drive ↔ calendar, 같은 부모 도메인)에서 회사를 바꾸면 공유 cookie 가
  // 갱신되고, 이 탭이 다시 포커스될 때 cookie 를 재읽어 state·데이터를 맞춘다.
  // BroadcastChannel 은 same-origin 만 닿으므로 cross-service 는 이 경로가 담당.
  // (운영 + COOKIE_DOMAIN 설정 시 의미. dev/host-only 면 사실상 no-op.)
  useEffect(() => {
    const sync = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") {
        return
      }
      const stored = readActiveCompanyCookie()
      if (!stored || !companies.includes(stored) || stored === activeCompanyId) return
      setActiveCompanyIdState(stored)
      queueMicrotask(() => {
        void mutate(() => true, undefined, { revalidate: true })
      })
      logger.info("active_company_synced_from_cookie", {
        category: "auth",
        active: stored,
      })
    }
    document.addEventListener("visibilitychange", sync)
    window.addEventListener("focus", sync)
    return () => {
      document.removeEventListener("visibilitychange", sync)
      window.removeEventListener("focus", sync)
    }
  }, [companies, activeCompanyId])

  const isSystemAdmin = me?.is_system_admin ?? false
  const isCompanyAdmin =
    isSystemAdmin ||
    (activeCompanyId
      ? me?.company_roles?.[activeCompanyId] === "admin"
      : false)

  const value: AppContextType = useMemo(
    () => ({
      authUser,
      bootstrapped,
      companies,
      companyNames,
      activeCompanyId,
      setActiveCompany,
      isSystemAdmin,
      isCompanyAdmin,
    }),
    [
      authUser,
      bootstrapped,
      companies,
      companyNames,
      activeCompanyId,
      setActiveCompany,
      isSystemAdmin,
      isCompanyAdmin,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useAppContext(): AppContextType {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useAppContext must be used within AppProvider")
  return ctx
}
