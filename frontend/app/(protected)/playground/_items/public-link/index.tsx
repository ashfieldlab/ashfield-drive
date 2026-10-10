"use client"

import { VariantA } from "./variant-a"
import { VariantB } from "./variant-b"
import { VariantC } from "./variant-c"

export const publicLinkVariants = [
  { key: "A", name: "가운데 카드" },
  { key: "B", name: "전체 화면 뷰어" },
  { key: "C", name: "브랜드 패널 분할" },
]

export function PublicLinkItem({ variant }: { variant: string }) {
  if (variant === "B") return <VariantB />
  if (variant === "C") return <VariantC />
  return <VariantA />
}
