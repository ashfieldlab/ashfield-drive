"use client"

import { VariantA } from "./variant-a"
import { VariantB } from "./variant-b"
import { VariantC } from "./variant-c"

export const moveDialogVariants = [
  { key: "A", name: "펼치는 트리" },
  { key: "B", name: "단계 탐색 + 경로" },
  { key: "C", name: "검색 팔레트" },
]

export function MoveDialogItem({ variant }: { variant: string }) {
  if (variant === "B") return <VariantB />
  if (variant === "C") return <VariantC />
  return <VariantA />
}
