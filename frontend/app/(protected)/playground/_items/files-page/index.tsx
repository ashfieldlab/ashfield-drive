"use client"

import { VariantA } from "./variant-a"
import { VariantB } from "./variant-b"
import { VariantC } from "./variant-c"
import { VariantD } from "./variant-d"

export const filesPageVariants = [
  { key: "A", name: "목록 + 상세 패널" },
  { key: "B", name: "갤러리" },
  { key: "C", name: "컬럼 브라우저" },
  { key: "D", name: "목록·갤러리 + 미리보기" },
]

export function FilesPageItem({ variant }: { variant: string }) {
  if (variant === "B") return <VariantB />
  if (variant === "C") return <VariantC />
  if (variant === "D") return <VariantD />
  return <VariantA />
}
