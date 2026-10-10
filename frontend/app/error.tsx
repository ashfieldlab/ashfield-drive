"use client"

import { useEffect } from "react"

import { ErrorPage } from "@/components/ui-custom/error-page"
import { logger } from "@/lib/utils/logger"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error("unhandled_error", {
      category: "ui",
      message: error.message,
      digest: error.digest,
    })
  }, [error])

  return <ErrorPage type="unknown-error" onClickPrimary={reset} primaryLabel="다시 시도" />
}
