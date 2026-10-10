"use client"

import { VariantA } from "./variant-a"
import { VariantB } from "./variant-b"
import { VariantC } from "./variant-c"

export const versionHistoryVariants = [
  { key: "A", name: "목록 + 행 동작" },
  { key: "B", name: "날짜별 타임라인" },
  { key: "C", name: "목록 + 미리보기" },
]

export function VersionHistoryItem({ variant }: { variant: string }) {
  if (variant === "B") return <VariantB />
  if (variant === "C") return <VariantC />
  return <VariantA />
}
