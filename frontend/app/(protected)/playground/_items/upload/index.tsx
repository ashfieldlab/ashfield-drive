"use client"

import { VariantA } from "./variant-a"
import { VariantB } from "./variant-b"
import { VariantC } from "./variant-c"
import { VariantD } from "./variant-d"

export const uploadVariants = [
  { key: "A", name: "플로팅 트레이" },
  { key: "B", name: "목록 안 진행 행" },
  { key: "C", name: "상단 배너 + 드롭 영역" },
  { key: "D", name: "B + 사이드바 표시" },
]

export function UploadItem({ variant }: { variant: string }) {
  if (variant === "B") return <VariantB />
  if (variant === "C") return <VariantC />
  if (variant === "D") return <VariantD />
  return <VariantA />
}
