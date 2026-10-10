"use client"

import { VariantA } from "./variant-a"
import { VariantB } from "./variant-b"
import { VariantC } from "./variant-c"

export const shareDialogVariants = [
  { key: "A", name: "한 줄 흐름" },
  { key: "B", name: "탭 + 링크 설정" },
  { key: "C", name: "사람 | 링크 카드" },
]

export function ShareDialogItem({ variant }: { variant: string }) {
  if (variant === "B") return <VariantB />
  if (variant === "C") return <VariantC />
  return <VariantA />
}
