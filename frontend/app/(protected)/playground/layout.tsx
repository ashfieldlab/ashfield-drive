import { Suspense } from "react"
import { notFound } from "next/navigation"

import { env } from "@/lib/env"

import { PlaygroundNav } from "./_components/playground-nav"

/**
 * 개발용 UI 플레이그라운드. 안 여러 개를 실제 데이터와 레이아웃 위에서 비교한다.
 * 운영 빌드에서는 404 (NEXT_PUBLIC_PLAYGROUND=true 로 강제로 켤 수 있다).
 */
export default function PlaygroundLayout({ children }: { children: React.ReactNode }) {
  if (!env.playground) notFound()

  return (
    <div className="flex h-[calc(100dvh-3.5rem)]">
      <Suspense>
        <PlaygroundNav />
      </Suspense>
      <div className="relative min-w-0 flex-1">
        <Suspense>{children}</Suspense>
      </div>
    </div>
  )
}

