"use client"

import { VariantA } from "./variant-a"
import { VariantB } from "./variant-b"
import { VariantC } from "./variant-c"

export const trashPageVariants = [
  { key: "A", name: "표 + 남은 기간" },
  { key: "B", name: "삭제 시기별 카드" },
  { key: "C", name: "요약 바 + 밀어내기" },
]

export function TrashPageItem({ variant }: { variant: string }) {
  if (variant === "B") return <VariantB />
  if (variant === "C") return <VariantC />
  return <VariantA />
}
