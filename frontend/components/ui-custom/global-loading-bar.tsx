"use client"

import { useEffect, useState } from "react"

import { subscribeActiveRequests } from "@/lib/api-client"

// 이보다 짧게 끝나는 요청은 바를 안 띄운다. 분할 업로드처럼 짧은 요청이 연달아
// 켜졌다 꺼지면(조각마다 URL 발급) 바가 깜빡이기만 하고 정보가 없다.
const SHOW_DELAY_MS = 300

/**
 * NProgress-style 상단 로딩 바.
 * api-client의 활성 요청 카운터를 구독해서, SHOW_DELAY_MS 넘게 이어질 때만 표시.
 */
export function GlobalLoadingBar() {
  const [active, setActive] = useState(0)
  const [visible, setVisible] = useState(false)
  useEffect(() => subscribeActiveRequests(setActive), [])

  useEffect(() => {
    if (active === 0) return
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    return () => {
      clearTimeout(t)
      setVisible(false)
    }
  }, [active > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 h-0.5 bg-blue-500 z-[300]"
      role="progressbar"
      aria-label="로딩 중"
      data-testid="global-loading-bar"
    />
  )
}
