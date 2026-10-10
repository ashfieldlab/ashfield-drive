"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { useApiGet } from "@/lib/hooks/use-api"
import * as e2e from "@/lib/e2e/session"
import { useVaultContext } from "@/lib/e2e/use-vault-context"
import type { AncestorsResponse, NodeScope } from "@/lib/types/api"

interface Props {
  scope: NodeScope
  folderId: string | null
  unlocked?: boolean
  // 보안 폴더 다크 배경 위: 밝은 텍스트로.
  onDark?: boolean
  // 부서 폴더 진입(from=team-folders): 루트를 "부서 폴더"로 표기하고 링크에 컨텍스트 유지.
  teamFolder?: boolean
}

export function FilesBreadcrumb({
  scope,
  folderId,
  unlocked = false,
  onDark = false,
  teamFolder = false,
}: Props) {
  // backend 가 recursive CTE 로 root→leaf 체인을 한 번에 반환.
  // SWR 가 folderId 별로 캐시하므로 같은 폴더 재방문 시 추가 fetch 없음.
  const { data } = useApiGet<AncestorsResponse>(
    folderId ? `/api/v1/nodes/${folderId}/ancestors` : null,
  )
  const { vaultRootId } = useVaultContext(folderId)
  const [decNames, setDecNames] = useState<Record<string, string>>({})

  const ctx = teamFolder ? "&from=team-folders" : ""
  const rootHref = teamFolder ? "/team-folders" : `/files?scope=${scope}`
  const rootLabel = teamFolder
    ? "부서 폴더"
    : scope === "personal"
      ? "내 파일"
      : "워크스페이스"
  const chain = data?.ancestors ?? []

  const vaultIdx = vaultRootId ? chain.findIndex((n) => n.id === vaultRootId) : -1

  // 잠긴 보안폴더 안에서는 자손 체인을 통째로 숨긴다: 이름뿐 아니라 "몇 단계
  // 깊이인지(구조)"까지 새면 안 됨. vault 루트까지만 노출하고 그 아래는 잘라냄.
  const displayChain = !unlocked && vaultIdx >= 0 ? chain.slice(0, vaultIdx + 1) : chain

  // vault 자손 폴더명은 ciphertext: 잠금해제 후에만 복호화. 잠기면 폐기.
  useEffect(() => {
    if (!vaultRootId || !unlocked || vaultIdx < 0) {
      setDecNames({})
      return
    }
    let cancelled = false
    void (async () => {
      const out: Record<string, string> = {}
      for (let i = vaultIdx + 1; i < chain.length; i++) {
        try {
          out[chain[i].id] = await e2e.decryptName(vaultRootId, chain[i].name)
        } catch {
          out[chain[i].id] = "🔒 (복호화 실패)"
        }
      }
      if (!cancelled) setDecNames(out)
    })()
    return () => {
      cancelled = true
    }
  }, [vaultRootId, unlocked, vaultIdx, data]) // eslint-disable-line react-hooks/exhaustive-deps

  // 표시: vault 자손은 잠김 시 마스킹(원본 ciphertext 노출 X), root/상위는 평문.
  const label = (idx: number, id: string, name: string): string => {
    const isVaultDescendant = vaultIdx >= 0 && idx > vaultIdx
    if (!isVaultDescendant) return name
    if (!unlocked) return "🔒 잠김"
    return decNames[id] ?? "🔒 …"
  }

  const linkHover = onDark ? "hover:text-white hover:underline" : "hover:text-gray-900 hover:underline"
  const chevron = onDark ? "text-slate-500" : "text-gray-400"
  const current = onDark ? "font-medium text-white" : "font-medium text-gray-900"

  return (
    <nav
      className={`flex min-w-0 items-center gap-1 overflow-hidden text-sm ${onDark ? "text-slate-300" : "text-gray-600"}`}
      data-testid="files-breadcrumb"
      aria-label="breadcrumb"
    >
      <Link
        href={rootHref}
        data-testid="files-breadcrumb-root"
        className={`shrink-0 ${linkHover}`}
      >
        {rootLabel}
      </Link>
      {folderId && displayChain.length === 0 && (
        <>
          <ChevronRight size={14} className={chevron} />
          <span className={chevron}>...</span>
        </>
      )}
      {displayChain.map((node, i) => {
        const isLast = i === displayChain.length - 1
        return (
          <span
            key={node.id}
            className={`flex items-center gap-1 ${isLast ? "min-w-0" : "shrink-0"}`}
          >
            <ChevronRight size={14} className={`shrink-0 ${chevron}`} />
            {isLast ? (
              <span
                className={`min-w-0 truncate ${current}`}
                title={node.name}
                data-testid={`files-breadcrumb-current`}
              >
                {label(i, node.id, node.name)}
              </span>
            ) : (
              <Link
                href={`/files?scope=${scope}&folder=${node.id}${ctx}`}
                data-testid={`files-breadcrumb-ancestor-${node.id}`}
                title={node.name}
                className={`max-w-[10rem] truncate ${linkHover}`}
              >
                {label(i, node.id, node.name)}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
