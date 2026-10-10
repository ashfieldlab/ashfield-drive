"use client"

import { VariantA } from "./variant-a"
import { VariantB } from "./variant-b"
import { VariantC } from "./variant-c"

export const vaultUnlockVariants = [
  { key: "A", name: "자물쇠 하나" },
  { key: "B", name: "단계별 마법사" },
  { key: "C", name: "흐려진 폴더 위" },
]

export function VaultUnlockItem({ variant }: { variant: string }) {
  if (variant === "B") return <VariantB />
  if (variant === "C") return <VariantC />
  return <VariantA />
}
