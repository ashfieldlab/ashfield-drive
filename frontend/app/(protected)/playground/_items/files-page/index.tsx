"use client"

import { VariantA } from "./variant-a"
import { VariantB } from "./variant-b"
import { VariantC } from "./variant-c"

export const filesPageVariants = [
  { key: "A", name: "목록 + 상세 패널" },
  { key: "B", name: "갤러리" },
  { key: "C", name: "컬럼 브라우저" },
]

export function FilesPageItem({ variant }: { variant: string }) {
  if (variant === "B") return <VariantB />
  if (variant === "C") return <VariantC />
  return <VariantA />
}
