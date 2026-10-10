"use client"

import { VariantA } from "./variant-a"
import { VariantB } from "./variant-b"
import { VariantC } from "./variant-c"

export const activityPageVariants = [
  { key: "A", name: "날짜별 타임라인" },
  { key: "B", name: "필터 + 로그 표" },
  { key: "C", name: "주간 요약 + 피드" },
]

export function ActivityPageItem({ variant }: { variant: string }) {
  if (variant === "B") return <VariantB />
  if (variant === "C") return <VariantC />
  return <VariantA />
}
