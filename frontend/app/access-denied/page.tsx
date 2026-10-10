import Link from "next/link"
import { ShieldAlert } from "lucide-react"

export default function AccessDeniedPage() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4"
      data-testid="access-denied-page"
    >
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <ShieldAlert size={28} />
        </div>
        <h1 className="text-xl font-semibold text-gray-900">
          접근 권한이 없습니다
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          이 계정은 아직 어떤 회사에도 속해 있지 않습니다. 관리자에게 회사 그룹
          배정을 요청하세요. 배정이 끝난 뒤 다시 로그인하면 워크스페이스를
          이용할 수 있습니다.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link
            href="/login"
            data-testid="access-denied-relogin"
            className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            다시 로그인
          </Link>
        </div>
      </div>
    </div>
  )
}
