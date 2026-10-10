"use client"

import { useState } from "react"

import { DEV_USERS } from "@/lib/dev-users"

interface Props {
  callbackUrl: string
  error?: string
}

/** 로컬(SKIP_AUTH) 전용 dev 사용자 선택 카드. */
export default function DevLogin({ callbackUrl, error }: Props) {
  const [pending, setPending] = useState<string | null>(null)

  async function login(key: string) {
    setPending(key)
    const res = await fetch("/api/auth/dev-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: key }),
    })
    if (!res.ok) {
      setPending(null)
      return
    }
    // 쿠키 발급 완료: 하드 내비게이션으로 가드를 다시 태운다.
    window.location.assign(callbackUrl)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-6 p-8 bg-white rounded-lg shadow-md">
        <div className="text-center space-y-2">
          <div className="inline-block px-3 py-1 text-xs font-medium text-amber-700 bg-amber-100 rounded">
            DEV
          </div>
          <h2 className="text-2xl font-bold text-gray-900">테스트 사용자 선택</h2>
          <p className="text-sm text-gray-600">로컬 모드: 게이트웨이 없이 dev 키로 로그인</p>
        </div>

        {error && (
          <div
            className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm"
            data-testid="login-error-alert"
          >
            로그인 중 오류가 발생했습니다. 다시 시도해 주세요.
          </div>
        )}

        <div className="space-y-2">
          {Object.entries(DEV_USERS).map(([key, user]) => (
            <button
              key={key}
              type="button"
              disabled={pending !== null}
              onClick={() => login(key)}
              data-testid={`login-dev-user-${key}-button`}
              className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <div className="text-left">
                <div className="font-medium text-gray-900">{user.name}</div>
                <div className="text-xs text-gray-500">{user.email}</div>
              </div>
              <div className="text-xs text-gray-400 space-x-2">
                <span>{user.companies.length}개 회사</span>
                {user.roles.includes("admin") && <span className="text-amber-700">admin</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
