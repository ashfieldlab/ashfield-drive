"use client"

/**
 * 앱 공통 레이아웃 프레임: 상단 헤더(브랜드·워크스페이스 전환·우측 위젯) + 좌측 내비게이션 + 본문.
 *
 * 도메인 지식은 없다. 메뉴 항목·우측 위젯·링크 렌더링(next/link 등)은 호출부
 * (components/layout/app-shell.tsx)가 넘긴다. 좁은 화면(< md)에서는 사이드바가
 * 햄버거 버튼으로 여는 드로어가 된다.
 */

import { useState } from "react"
import { Check, ChevronsUpDown, Menu, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export interface WorkspaceOption {
  id: string
  name: string
}

export interface NavItem {
  id: string
  label: string
  href?: string
  icon?: React.ReactNode
  active?: boolean
}

/** renderNavLink 가 링크 요소에 그대로 펼쳐 써야 하는 속성 */
export interface NavLinkRenderProps {
  className: string
  "data-active": boolean
  children: React.ReactNode
}

export interface AppFrameProps {
  brand: {
    name: string
    logo?: React.ReactNode
    /** 로고·서비스명 클릭 */
    onClick?: () => void
  }
  /** 소속 워크스페이스가 있을 때만 넘긴다: 없으면 전환 UI 숨김 */
  workspaceSwitcher?: {
    workspaces: WorkspaceOption[]
    selectedId?: string
    onSelect: (workspace: WorkspaceOption) => void
  }
  /** 헤더 우측 영역 (검색·알림·사용자 메뉴 등) */
  headerTrailing?: React.ReactNode
  navItems: NavItem[]
  /** 기본은 <a href>. 클라이언트 라우팅이 필요하면 next/link 로 렌더 */
  renderNavLink?: (item: NavItem, props: NavLinkRenderProps) => React.ReactNode
  /** 루트 (기본 min-h-screen; 페이지 내부 스크롤이면 h-screen) */
  className?: string
  /** <main> */
  mainClassName?: string
  /** <main> 안쪽 콘텐츠 컨테이너 */
  containerClassName?: string
  children: React.ReactNode
}

const navLinkClass =
  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary [&_svg]:shrink-0"

export function AppFrame({
  brand,
  workspaceSwitcher,
  headerTrailing,
  navItems,
  renderNavLink,
  className,
  mainClassName,
  containerClassName,
  children,
}: AppFrameProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const nav = (
    <nav aria-label="주 메뉴" className="flex flex-col gap-0.5 p-3">
      {navItems.map((item) => {
        const props: NavLinkRenderProps = {
          className: navLinkClass,
          "data-active": !!item.active,
          children: (
            <>
              {item.icon}
              <span className="truncate">{item.label}</span>
            </>
          ),
        }
        return (
          <div key={item.id}>
            {renderNavLink ? (
              renderNavLink(item, props)
            ) : (
              <a href={item.href ?? "#"} data-testid={`nav-link-${item.id}`} {...props} />
            )}
          </div>
        )
      })}
    </nav>
  )

  return (
    <div className={cn("flex min-h-screen flex-col bg-background", className)}>
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 md:gap-3 md:px-4">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="메뉴 열기"
          data-testid="app-nav-open"
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu />
        </Button>
        <button
          type="button"
          onClick={brand.onClick}
          className="flex min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          data-testid="app-brand"
        >
          {brand.logo}
          <span className="truncate text-base font-semibold text-foreground">
            {brand.name}
          </span>
        </button>
        {workspaceSwitcher && <WorkspaceSwitcher {...workspaceSwitcher} />}
        <div className="ml-auto flex items-center gap-2">{headerTrailing}</div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 overflow-y-auto border-r bg-sidebar md:block">
          {nav}
        </aside>

        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside
              className="absolute inset-y-0 left-0 flex w-64 flex-col overflow-y-auto border-r bg-sidebar shadow-lg"
              // 메뉴 링크를 누르면 드로어를 닫는다 (라우팅은 링크가 처리)
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a")) setMobileNavOpen(false)
              }}
            >
              <div className="flex h-14 items-center justify-between border-b px-3">
                <span className="truncate font-semibold">{brand.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="메뉴 닫기"
                  data-testid="app-nav-close"
                  onClick={() => setMobileNavOpen(false)}
                >
                  <X />
                </Button>
              </div>
              {nav}
            </aside>
          </div>
        )}

        <main className={cn("min-w-0 flex-1 overflow-auto", mainClassName)}>
          <div className={containerClassName}>{children}</div>
        </main>
      </div>
    </div>
  )
}

function WorkspaceSwitcher({
  workspaces,
  selectedId,
  onSelect,
}: NonNullable<AppFrameProps["workspaceSwitcher"]>) {
  const selected = workspaces.find((c) => c.id === selectedId)

  // 워크스페이스가 하나뿐이면 전환할 게 없으므로 이름만 표시
  if (workspaces.length < 2) {
    return (
      <span
        className="max-w-48 truncate px-2 text-sm text-muted-foreground"
        data-testid="workspace-switcher"
      >
        {selected?.name ?? workspaces[0]?.name}
      </span>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="max-w-48 text-muted-foreground"
          data-testid="workspace-switcher"
        >
          <span className="truncate">{selected?.name ?? "워크스페이스 선택"}</span>
          <ChevronsUpDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>워크스페이스</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onSelect={() => onSelect(c)}
            data-testid={`workspace-option-${c.id}`}
          >
            <span className="truncate">{c.name}</span>
            {c.id === selectedId && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
