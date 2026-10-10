import Image from "next/image"

import { cn } from "@/lib/utils"

interface AppIconProps {
  /** public/icons/ashfield/ 아래 파일명 */
  file?: string
  alt: string
  /** 렌더 크기(px): 실제 표시 크기는 className 으로 조절 */
  size?: number
  className?: string
}

/** Ashfield 앱 아이콘 (public/icons/ashfield/*). */
export function AppIcon({ file = "appicon_192.png", alt, size = 28, className }: AppIconProps) {
  return (
    <Image
      src={`/icons/ashfield/${file}`}
      alt={alt}
      width={size}
      height={size}
      unoptimized
      className={cn("shrink-0", className)}
    />
  )
}
