/**
 * E2E 엔드포인트 클라이언트 (ADR-0016): backend 의 불투명 blob 보관소와 통신.
 * 암호 연산은 전혀 없음 (전부 crypto.ts/session.ts). 여기는 전송만.
 */

import { api } from "@/lib/api-client"

export interface KeyBundle {
  salt: string
  public_key: string
  enc_private_key: string
  enc_private_key_recovery: string
}

export interface VaultOut {
  node_id: string
  company_id: string
  created_by: string
  /** 요청자가 이 vault 의 멤버인지 (접근 가능 여부) */
  is_member: boolean
  /** 요청자의 권한 (read/write/manage): 없으면 null */
  my_permission: "read" | "write" | "manage" | null
}

export interface VaultMemberOut {
  user_sub: string
  created_at: string
}

export async function getMyKeys(): Promise<KeyBundle | null> {
  try {
    return await api<KeyBundle>("/api/v1/e2e/keys/me")
  } catch (err) {
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 404) {
      return null // 아직 미설정
    }
    throw err
  }
}

export async function putMyKeys(bundle: KeyBundle): Promise<void> {
  await api("/api/v1/e2e/keys/me", { method: "PUT", body: bundle })
}

export async function getPublicKey(userSub: string): Promise<string> {
  const r = await api<{ user_sub: string; public_key: string }>(
    `/api/v1/e2e/keys/${encodeURIComponent(userSub)}/public`,
  )
  return r.public_key
}

export async function listVaults(): Promise<VaultOut[]> {
  return api<VaultOut[]>("/api/v1/e2e/vaults")
}

export async function createVault(nodeId: string, wrappedVaultKey: string): Promise<void> {
  await api("/api/v1/e2e/vaults", {
    method: "POST",
    body: { node_id: nodeId, wrapped_vault_key: wrappedVaultKey },
  })
}

export async function getVaultKey(nodeId: string): Promise<string | null> {
  try {
    const r = await api<{ node_id: string; wrapped_vault_key: string }>(
      `/api/v1/e2e/vaults/${nodeId}/key`,
    )
    return r.wrapped_vault_key
  } catch (err) {
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 404) {
      return null
    }
    throw err
  }
}

export async function listVaultMembers(nodeId: string): Promise<VaultMemberOut[]> {
  return api<VaultMemberOut[]>(`/api/v1/e2e/vaults/${nodeId}/members`)
}

export async function addVaultMember(
  nodeId: string,
  userSub: string,
  wrappedVaultKey: string,
): Promise<void> {
  await api(`/api/v1/e2e/vaults/${nodeId}/members`, {
    method: "POST",
    body: { user_sub: userSub, wrapped_vault_key: wrappedVaultKey },
  })
}

export async function removeVaultMember(nodeId: string, userSub: string): Promise<void> {
  await api(`/api/v1/e2e/vaults/${nodeId}/members/${encodeURIComponent(userSub)}`, {
    method: "DELETE",
  })
}
