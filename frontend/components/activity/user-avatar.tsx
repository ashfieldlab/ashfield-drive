/* eslint-disable @next/next/no-img-element -- 외부 프로필 이미지 URL (계정 서버 제공), next/image 도메인 설정 대상 아님 */
import { cn } from "@/lib/utils"

const PALETTE = ["#4f6b4a", "#2563eb", "#d97706", "#db2777", "#7c3aed", "#0d9488", "#dc2626", "#0891b2"]

/** 같은 사람은 늘 같은 색 */
export function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

export function UserAvatar({
  name,
  seed,
  image,
  size = 28,
  className,
}: {
  name: string
  seed: string
  image?: string | null
  size?: number
  className?: string
}) {
  if (image) {
    return (
      <img
        src={image}
        alt={name}
        title={name}
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white", className)}
      style={{ background: avatarColor(seed), width: size, height: size, fontSize: size * 0.4 }}
      title={name}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}
