"use client"

import { LogOut, Settings, ShieldCheck } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ThemeSubmenu } from "@/components/ui-custom/theme-menu"

interface UserMenuProps {
  user: { name?: string }
  /** 서비스 관리자면 "서비스 설정" 메뉴 노출 */
  isServiceAdmin?: boolean
  onLogout: () => void | Promise<void>
  onBasicSettings?: () => void
  onServiceSettings?: () => void
}

/** 헤더 우측 사용자 메뉴: 이니셜 아바타 + 설정, 테마, 로그아웃 드롭다운. */
export function UserMenu({
  user,
  isServiceAdmin = false,
  onLogout,
  onBasicSettings,
  onServiceSettings,
}: UserMenuProps) {
  const name = user.name?.trim() || "사용자"
  const initial = name.charAt(0).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="사용자 메뉴"
          data-testid="user-menu-trigger"
          className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {onBasicSettings && (
          <DropdownMenuItem onSelect={onBasicSettings} data-testid="user-menu-settings">
            <Settings />
            기본 설정
          </DropdownMenuItem>
        )}
        {isServiceAdmin && onServiceSettings && (
          <DropdownMenuItem
            onSelect={onServiceSettings}
            data-testid="user-menu-service-settings"
          >
            <ShieldCheck />
            서비스 설정
          </DropdownMenuItem>
        )}
        <ThemeSubmenu />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => void onLogout()}
          data-testid="user-menu-logout"
        >
          <LogOut />
          로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
