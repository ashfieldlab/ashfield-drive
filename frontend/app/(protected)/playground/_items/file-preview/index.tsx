"use client"

import { VariantA } from "./variant-a"
import { VariantB } from "./variant-b"
import { VariantC } from "./variant-c"

export const filePreviewVariants = [
  { key: "A", name: "라이트박스 + 필름스트립" },
  { key: "B", name: "목록 + 사이드 시트" },
  { key: "C", name: "분할 창 + 정보 패널" },
]

export function FilePreviewItem({ variant }: { variant: string }) {
  if (variant === "B") return <VariantB />
  if (variant === "C") return <VariantC />
  return <VariantA />
}
