"use client"

/**
 * 현재 폴더가 vault(보안 폴더)에 속하는지 판정 (ADR-0016).
 *
 * vault 는 folder node 에 걸림. 현재 폴더 자신 또는 조상 중 vault 가 있으면
 * 그 전체 서브트리가 암호화 대상이고, vault_key 는 그 vault root 의 것을 씀.
 *
 * 반환:
 *  - vaultRootId: 이 폴더가 속한 vault 의 root node_id (없으면 null)
 *  - isVaultRoot: 현재 폴더 자체가 vault
 *  - canMakeVault: 일반 빈 폴더라 vault 로 전환 가능 (childless 는 호출측 판단)
 */

import { useApiGet } from "@/lib/hooks/use-api"
import type { AncestorsResponse } from "@/lib/types/api"
import type { VaultOut } from "./api"

export interface VaultContext {
  vaultRootId: string | null
  isVaultRoot: boolean
  canMakeVault: boolean
  /** vault 밖이거나(=true) vault 멤버면 true. vault 인데 비멤버면 false. */
  hasAccess: boolean
  /** vault 밖이거나 write/manage 권한이면 true. 읽기전용 멤버면 false (쓰기 버튼 숨김). */
  canWrite: boolean
  loading: boolean
}

export function useVaultContext(folderId: string | null): VaultContext {
  const { data: vaults, isLoading: vLoading } = useApiGet<VaultOut[]>(
    "/api/v1/e2e/vaults",
  )
  // 조상: folderId 있을 때만. 루트(null)면 vault 일 수 없음.
  const { data: anc, isLoading: aLoading } = useApiGet<AncestorsResponse>(
    folderId ? `/api/v1/nodes/${folderId}/ancestors` : null,
  )

  const vaultList = vaults ?? []
  const vaultIds = new Set(vaultList.map((v) => v.node_id))
  const loading = vLoading || (folderId !== null && aLoading)

  if (!folderId) {
    return {
      vaultRootId: null,
      isVaultRoot: false,
      canMakeVault: false,
      hasAccess: true,
      canWrite: true,
      loading,
    }
  }

  // 현재 폴더 자신 → 조상 순으로 vault 탐색
  const chain = [folderId, ...((anc?.ancestors ?? []).map((a) => a.id))]
  const vaultRootId = chain.find((id) => vaultIds.has(id)) ?? null
  const matched = vaultRootId
    ? vaultList.find((v) => v.node_id === vaultRootId)
    : null

  return {
    vaultRootId,
    isVaultRoot: vaultRootId === folderId,
    canMakeVault: vaultRootId === null, // vault 밖 일반 폴더 (빈 폴더 여부는 호출측)
    // vault 밖이면 접근 가능. vault 면 실제 권한(my_permission) 기준.
    // is_member(키 보유)만으론 ACL 과 어긋나 403 스팸이 날 수 있어 effective 권한으로.
    hasAccess: vaultRootId === null ? true : matched?.my_permission != null,
    // vault 밖이면 쓰기 가능. vault 면 write/manage 권한일 때만 (읽기전용 멤버는 false).
    canWrite:
      vaultRootId === null
        ? true
        : matched?.my_permission === "write" || matched?.my_permission === "manage",
    loading,
  }
}
