"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import {
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"

const THEMES = [
  { value: "system", label: "시스템", icon: Monitor },
  { value: "light", label: "라이트", icon: Sun },
  { value: "dark", label: "다크", icon: Moon },
] as const

/** 사용자 메뉴 안의 "테마" 하위 메뉴 (시스템·라이트·다크). DropdownMenuContent 안에서만 쓴다. */
export function ThemeSubmenu() {
  const { theme, setTheme } = useTheme()
  const current = THEMES.find((t) => t.value === theme) ?? THEMES[0]
  const CurrentIcon = current.icon

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger data-testid="user-menu-theme">
        <CurrentIcon />
        <span className="flex-1">테마</span>
        <span className="text-xs text-muted-foreground">{current.label}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="w-32">
          <DropdownMenuRadioGroup value={current.value} onValueChange={setTheme}>
            {THEMES.map(({ value, label, icon: Icon }) => (
              <DropdownMenuRadioItem
                key={value}
                value={value}
                data-testid={`user-menu-theme-${value}`}
              >
                <Icon />
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}
