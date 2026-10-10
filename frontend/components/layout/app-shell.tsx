"use client"

import { useMemo } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  Activity,
  Folder,
  Settings,
  Share2,
  Trash2,
  Users,
} from "lucide-react"

import {
  AppFrame,
  type CompanyOption,
  type NavItem,
  type NavLinkRenderProps,
} from "@/components/ui-custom/app-frame"
import { AppIcon } from "@/components/ui-custom/app-icon"
import { UserMenu } from "@/components/ui-custom/user-menu"

import { useAppContext } from "@/components/providers/app-context"
import { AppCrossLink } from "@/components/layout/app-cross-link"
import { GlobalSearch } from "@/components/layout/global-search"
import { NotificationBell } from "@/components/layout/notification-bell"
import { signOutAction } from "@/lib/actions/auth"
import { APP } from "@/lib/apps"

export function AppShell({ children }: { children: React.ReactNode }) {
  const { authUser, companies, companyNames, activeCompanyId, setActiveCompany, isSystemAdmin } =
    useAppContext()
  const pathname = usePathname() ?? ""
  const sp = useSearchParams()
  const router = useRouter()

  // files 페이지의 sub-link 활성화 — query string 기반.
  const filesActive = useMemo(() => {
    const isFiles = pathname.startsWith("/files")
    if (!isFiles) return null
    const trash = sp?.get("trash") === "1"
    const sharedWithMe = sp?.get("view") === "shared-with-me"
    const scope = sp?.get("scope")
    const fromTeam = sp?.get("from") === "team-folders"
    return {
      personal: !trash && !sharedWithMe && scope !== "shared",
      // 부서 폴더 컨텍스트면 "회사 공유"로 잡지 않음 (부서 폴더 메뉴가 활성).
      shared: !trash && !sharedWithMe && scope === "shared" && !fromTeam,
      sharedWithMe,
      trash,
      fromTeam,
    }
  }, [pathname, sp])

  // 사이드바 = 파일 기능 + 하단 공통(활동·설정). 일정 앱 링크는 헤더 우측 AppCrossLink.
  const sidebarItems: NavItem[] = useMemo(() => {
    const common: NavItem[] = [
      { id: "activity", label: "활동", href: "/activity", icon: <Activity size={16} />, active: pathname.startsWith("/activity") },
      { id: "settings", label: "설정", href: "/settings", icon: <Settings size={16} />, active: pathname.startsWith("/settings") },
    ]
    return [
      { id: "files-personal", label: "내 파일", href: "/files?scope=personal", icon: <Folder size={16} />, active: filesActive?.personal },
      { id: "files-shared", label: "회사 공유", href: "/files?scope=shared", icon: <Users size={16} />, active: filesActive?.shared },
      { id: "files-shared-with-me", label: "공유받음", href: "/files?view=shared-with-me", icon: <Share2 size={16} />, active: filesActive?.sharedWithMe },
      // "부서 폴더" 메뉴는 부서 소스(외부 디렉터리) 제거로 숨김 (ADR-0023, backend/app/services/departments.py).
      { id: "files-trash", label: "휴지통", href: "/files?trash=1", icon: <Trash2 size={16} />, active: filesActive?.trash },
      ...common,
    ]
  }, [filesActive, pathname])

  const companyOptions: CompanyOption[] = useMemo(
    () => companies.map((c) => ({ id: c, name: companyNames[c] ?? c })),
    [companies, companyNames],
  )

  const sidebarRenderLink = (
    item: NavItem,
    props: NavLinkRenderProps,
  ) => (
    <Link
      href={item.href ?? "#"}
      className={props.className}
      data-active={props["data-active"]}
      data-testid={`nav-link-${item.id}`}
    >
      {props.children}
    </Link>
  )

  // 우측 클러스터 — 앱 전환 + 검색 + 알림 + 사용자 메뉴(로그아웃). headerTrailing 은
  // 헤더 우측 전체를 대체하므로, 우리 실데이터 위젯을 여기서 직접 조립한다.
  const headerTrailing = authUser ? (
    <div className="flex items-center gap-2">
      <AppCrossLink />
      <GlobalSearch />
      <NotificationBell />
      <UserMenu
        user={{ name: authUser.name ?? authUser.email ?? undefined }}
        isServiceAdmin={isSystemAdmin}
        onLogout={async () => {
          // Better Auth 세션 종료 후 받은 주소로 하드 이동 (가드·AppContext 를 새로 태움).
          window.location.href = await signOutAction()
        }}
        onBasicSettings={() => router.push("/settings")}
        onServiceSettings={() => router.push("/admin")}
      />
    </div>
  ) : undefined

  return (
    <AppFrame
      companySwitcher={
        companies.length > 0
          ? {
              companies: companyOptions,
              selectedId: activeCompanyId ?? undefined,
              onSelect: (c) => setActiveCompany(c.id),
            }
          : undefined
      }
      brand={{
        name: APP.title,
        logo: <AppIcon alt={APP.title} className="h-7 w-7 rounded-md" />,
        onClick: () => router.push(APP.home),
      }}
      headerTrailing={headerTrailing}
      navItems={sidebarItems}
      renderNavLink={sidebarRenderLink}
      // 뷰포트 높이로 고정 — 페이지가 자체 h-full overflow-y-auto 로 내부 스크롤.
      // (프레임 기본은 min-h-screen 이라 안 잡으면 페이지 대신 창 전체가 스크롤됨)
      className="h-screen"
      // main/container 를 flex 로 확정 높이 전달 — 페이지의 h-full(height:100%)이
      // percentage 로 접히지 않고 뷰포트 높이를 꽉 채우도록.
      mainClassName="flex flex-col min-h-0"
      containerClassName="flex-1 min-h-0"
    >
      {children}
    </AppFrame>
  )
}
