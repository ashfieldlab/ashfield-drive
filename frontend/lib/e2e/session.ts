/**
 * E2E 세션 키 관리 (ADR-0016): 잠금해제된 개인키 + vault_key 캐시를 메모리에만.
 *
 * 새로고침하면 사라짐 → 다시 잠금해제 필요 (의도된 동작: 키 평문 영속 안 함).
 * 설정(setup) / 잠금해제(unlock) / vault 생성·키 획득 / 파일 암복호 오케스트레이션.
 */

import * as c from "./crypto"
import * as e2eApi from "./api"

interface SessionState {
  privateKey: CryptoKey
  publicKey: CryptoKey
  publicKeyB64: string
}

let _session: SessionState | null = null
const _vaultKeys = new Map<string, CryptoKey>() // nodeId → vault_key

export function isUnlocked(): boolean {
  return _session !== null
}

export function lock(): void {
  _session = null
  _vaultKeys.clear()
}

/** E2E 키 미설정 여부: 첫 설정 UI 분기용 */
export async function needsSetup(): Promise<boolean> {
  return (await e2eApi.getMyKeys()) === null
}

/**
 * 첫 설정: 키쌍 생성 + 개인키를 비밀번호/복구코드로 잠가 등록.
 * 복구 코드를 반환 (1회만 표시: 분실 시 비밀번호 복구 불가).
 */
export async function setup(password: string): Promise<{ recoveryCode: string }> {
  const pair = await c.generateKeypair()
  const salt = c.newSalt()
  const recoveryCode = c.generateRecoveryCode()

  const kek = await c.deriveKek(password, salt)
  const recoveryKek = await c.deriveKek(recoveryCode, salt)

  const bundle: e2eApi.KeyBundle = {
    salt: c.toB64(salt),
    public_key: await c.exportPublicKey(pair.publicKey),
    enc_private_key: await c.exportPrivateKeyEncrypted(pair.privateKey, kek),
    enc_private_key_recovery: await c.exportPrivateKeyEncrypted(pair.privateKey, recoveryKek),
  }
  await e2eApi.putMyKeys(bundle)

  _session = {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    publicKeyB64: bundle.public_key,
  }
  return { recoveryCode }
}

/** 잠금해제: 비밀번호(또는 복구코드)로 개인키 복원해 메모리에. */
export async function unlock(password: string, useRecovery = false): Promise<void> {
  const bundle = await e2eApi.getMyKeys()
  if (!bundle) throw new Error("E2E 키 미설정")
  const salt = c.fromB64(bundle.salt)
  const kek = await c.deriveKek(password, salt)
  const encPriv = useRecovery ? bundle.enc_private_key_recovery : bundle.enc_private_key
  let privateKey: CryptoKey
  try {
    privateKey = await c.importPrivateKeyEncrypted(encPriv, kek)
  } catch {
    throw new Error("비밀번호가 올바르지 않습니다")
  }
  _session = {
    privateKey,
    publicKey: await c.importPublicKey(bundle.public_key),
    publicKeyB64: bundle.public_key,
  }
}

function requireSession(): SessionState {
  if (!_session) throw new Error("잠금해제 필요")
  return _session
}

// ---------------------------------------------------------------------------
// vault_key: 폴더당 1개. 잠금해제된 개인키로 unwrap 후 캐시.
// ---------------------------------------------------------------------------
export async function createVault(nodeId: string): Promise<void> {
  const s = requireSession()
  const vaultKey = await c.generateAesKey()
  const wrapped = await c.wrapKeyRsa(vaultKey, s.publicKey)
  await e2eApi.createVault(nodeId, wrapped)
  _vaultKeys.set(nodeId, vaultKey)
}

export async function getVaultKey(nodeId: string): Promise<CryptoKey | null> {
  const cached = _vaultKeys.get(nodeId)
  if (cached) return cached
  const s = requireSession()
  const wrapped = await e2eApi.getVaultKey(nodeId)
  if (!wrapped) return null
  const vaultKey = await c.unwrapKeyRsa(wrapped, s.privateKey)
  _vaultKeys.set(nodeId, vaultKey)
  return vaultKey
}

/** 공유: 대상 사용자의 공개키로 vault_key 를 re-wrap 해 멤버 추가. */
export async function shareVault(nodeId: string, targetUserSub: string): Promise<void> {
  const vaultKey = await getVaultKey(nodeId)
  if (!vaultKey) throw new Error("vault_key 없음 (멤버 아님)")
  const targetPubB64 = await e2eApi.getPublicKey(targetUserSub)
  const targetPub = await c.importPublicKey(targetPubB64)
  const wrapped = await c.wrapKeyRsa(vaultKey, targetPub)
  await e2eApi.addVaultMember(nodeId, targetUserSub, wrapped)
}

/** 공유 해제: vault 멤버에서 제거 (해당 사용자의 wrapped vault_key 삭제). */
export async function unshareVault(nodeId: string, targetUserSub: string): Promise<void> {
  await e2eApi.removeVaultMember(nodeId, targetUserSub)
}

// ---------------------------------------------------------------------------
// 파일 암복호: DEK 는 파일마다 새로. vault_key 로 wrap.
// ---------------------------------------------------------------------------
export interface EncryptedUpload {
  ciphertext: Blob
  wrappedDek: string
  encryptedName: string
}

/** 업로드용: 파일 내용 암호화 + 파일명 암호화 + DEK wrap */
export async function encryptForUpload(
  vaultNodeId: string,
  file: File,
): Promise<EncryptedUpload> {
  const vaultKey = await getVaultKey(vaultNodeId)
  if (!vaultKey) throw new Error("vault 접근 권한 없음")
  const dek = await c.generateAesKey()
  const plain = new Uint8Array(await file.arrayBuffer())
  const ctB64 = await c.aesEncrypt(dek, plain)
  return {
    ciphertext: new Blob([c.fromB64(ctB64) as unknown as BlobPart]),
    wrappedDek: await c.wrapKeyAes(dek, vaultKey),
    encryptedName: await c.aesEncryptText(vaultKey, file.name),
  }
}

/** 다운로드용: wrapped DEK 풀고 내용 복호화 */
export async function decryptDownload(
  vaultNodeId: string,
  wrappedDek: string,
  ciphertext: ArrayBuffer,
): Promise<Uint8Array> {
  const vaultKey = await getVaultKey(vaultNodeId)
  if (!vaultKey) throw new Error("vault 접근 권한 없음")
  const dek = await c.unwrapKeyAes(wrappedDek, vaultKey)
  return c.aesDecrypt(dek, c.toB64(new Uint8Array(ciphertext)))
}

/** 파일명 복호화 (트리 표시용) */
export async function decryptName(vaultNodeId: string, encryptedName: string): Promise<string> {
  const vaultKey = await getVaultKey(vaultNodeId)
  if (!vaultKey) throw new Error("vault 접근 권한 없음")
  return c.aesDecryptText(vaultKey, encryptedName)
}

/** 폴더명 암호화 (vault 안 새 폴더 생성용): 파일명과 동일하게 vault_key 로 */
export async function encryptName(vaultNodeId: string, name: string): Promise<string> {
  const vaultKey = await getVaultKey(vaultNodeId)
  if (!vaultKey) throw new Error("vault 접근 권한 없음")
  return c.aesEncryptText(vaultKey, name)
}
