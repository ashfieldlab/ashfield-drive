"use client"

import { use, useEffect, useState } from "react"

import {
  fetchPublicMeta,
  isUnlocked,
  type MetaResult,
  type UnlockedMeta,
} from "@/components/public-link/public-api"
import {
  ExpiredPane,
  FilePane,
  FolderPane,
  LoadingPane,
  NotFoundPane,
  PasswordPane,
  PublicLinkFrame,
} from "@/components/public-link/public-link-view"

export default function ExternalLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [result, setResult] = useState<MetaResult | null>(null)
  const [unlocked, setUnlocked] = useState<{ password: string; meta: UnlockedMeta } | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchPublicMeta(token).then((r) => {
      if (!cancelled) setResult(r)
    })
    return () => {
      cancelled = true
    }
  }, [token])

  if (result === null) {
    return (
      <PublicLinkFrame panel={{ title: "" }}>
        <LoadingPane />
      </PublicLinkFrame>
    )
  }

  if (result.status === "expired") {
    return (
      <PublicLinkFrame
        panel={{
          title: "만료됨",
          sharerName: result.info.sharer_name,
          expiresAt: result.info.expired_at,
          expired: true,
        }}
      >
        <ExpiredPane info={result.info} />
      </PublicLinkFrame>
    )
  }

  if (result.status !== "ok") {
    return (
      <PublicLinkFrame panel={{ title: "" }}>
        <NotFoundPane error={result.status === "error"} />
      </PublicLinkFrame>
    )
  }

  const base = result.meta
  const full: UnlockedMeta | null = unlocked?.meta ?? (isUnlocked(base) ? base : null)
  const password = unlocked?.password ?? null
  return (
    <PublicLinkFrame
      testid="external-link-page"
      panel={{
        title: full ? full.name : "보호된 항목",
        sharerName: base.sharer_name,
        expiresAt: base.expires_at,
      }}
    >
      {!full ? (
        <PasswordPane token={token} onUnlock={(pw, meta) => setUnlocked({ password: pw, meta })} />
      ) : full.kind === "folder" ? (
        <FolderPane token={token} meta={full} password={password} />
      ) : (
        <FilePane token={token} meta={full} password={password} />
      )}
    </PublicLinkFrame>
  )
}
