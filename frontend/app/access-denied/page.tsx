import Link from "next/link"
import { ShieldAlert } from "lucide-react"

export default function AccessDeniedPage() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-muted/50 px-4 dark:bg-background"
      data-testid="access-denied-page"
    >
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
          <ShieldAlert size={28} />
        </div>
        <h1 className="text-xl font-semibold text-foreground">
          접근 권한이 없습니다
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          속한 워크스페이스가 없습니다. 관리자에게 멤버 추가를 요청하세요.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link
            href="/login"
            data-testid="access-denied-relogin"
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            다시 로그인
          </Link>
        </div>
      </div>
    </div>
  )
}
