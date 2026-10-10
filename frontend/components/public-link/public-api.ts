/**
 * 외부 공유 링크 공개 API (`/api/external/*` → 백엔드 `/s/*`, backend/app/api/external.py).
 *
 * `api()` 는 로그인 BFF(/api/v1) 전용이라 쓰지 않는다: 이 페이지는 로그인 없이 열리고
 * 인증, 워크스페이스 헤더를 붙이면 안 된다. 그래서 same-origin 공개 프록시를 fetch 로 직접 호출.
 */

export interface PublicNodeMeta {
  /** 비밀번호 링크는 확인 전엔 null (항목 정보 비노출) */
  node_id: string | null
  name: string | null
  kind: "file" | "folder" | null
  size_bytes: number | null
  mime: string | null
  permission: "read" | "write"
  requires_password: boolean
  sharer_name?: string | null
  sharer_email?: string | null
  expires_at?: string | null
}

/** 확인이 끝나 항목 정보가 채워진 메타 */
export type UnlockedMeta = PublicNodeMeta & {
  node_id: string
  name: string
  kind: "file" | "folder"
}

/** 만료 응답(410) 의 detail */
export interface ExpiredInfo {
  sharer_name?: string | null
  sharer_email?: string | null
  expired_at?: string | null
}

export interface PublicFolderItem {
  id: string
  name: string
  kind: "file" | "folder"
  size_bytes: number | null
  mime: string | null
  updated_at: string
  /** 보안 폴더는 링크로 열 수 없다 */
  available: boolean
}

export interface PublicFolderListing {
  folder_id: string
  name: string
  path: { id: string; name: string }[]
  items: PublicFolderItem[]
}

export type MetaResult =
  | { status: "ok"; meta: PublicNodeMeta }
  | { status: "expired"; info: ExpiredInfo }
  | { status: "not_found" }
  | { status: "error" }

export class PublicLinkError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const base = (token: string) => `/api/external/${encodeURIComponent(token)}`

export function isUnlocked(meta: PublicNodeMeta): meta is UnlockedMeta {
  return meta.node_id !== null && meta.name !== null && meta.kind !== null
}

export async function fetchPublicMeta(token: string): Promise<MetaResult> {
  try {
    const r = await fetch(base(token), { cache: "no-store" })
    if (r.ok) return { status: "ok", meta: (await r.json()) as PublicNodeMeta }
    if (r.status === 410) {
      const body = (await r.json().catch(() => ({}))) as { detail?: unknown }
      const info = typeof body.detail === "object" && body.detail ? (body.detail as ExpiredInfo) : {}
      return { status: "expired", info }
    }
    if (r.status === 404) return { status: "not_found" }
    return { status: "error" }
  } catch {
    return { status: "error" }
  }
}

async function post<T>(token: string, path: string, body: object): Promise<T> {
  const r = await fetch(`${base(token)}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new PublicLinkError(r.status, `HTTP ${r.status}`)
  return (await r.json()) as T
}

/** 비밀번호 확인 + 항목 메타. 401 = 비밀번호 틀림 */
export function unlockMeta(token: string, password: string): Promise<PublicNodeMeta> {
  return post<PublicNodeMeta>(token, "meta", { password })
}

/** presigned GET URL. nodeId = 폴더 링크 안의 파일 */
export async function requestDownloadUrl(
  token: string,
  password: string | null,
  nodeId?: string,
): Promise<string> {
  const { url } = await post<{ url: string }>(token, "download", {
    password: password || null,
    node_id: nodeId ?? null,
  })
  return url
}

export function listFolder(
  token: string,
  password: string | null,
  folderId: string | null,
): Promise<PublicFolderListing> {
  return post<PublicFolderListing>(token, "list", { password: password || null, folder_id: folderId })
}

/** 폴더 ZIP 을 받는다 (본문 스트림, 진행률 콜백). 서버가 묶은 뒤 보내므로 길이를 안다 */
export async function fetchZip(
  token: string,
  password: string | null,
  folderId: string | null,
  onProgress: (pct: number) => void,
): Promise<Blob> {
  const r = await fetch(`${base(token)}/zip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: password || null, folder_id: folderId }),
  })
  if (!r.ok || !r.body) throw new PublicLinkError(r.status, `HTTP ${r.status}`)
  return readWithProgress(r, 0, onProgress, "application/zip")
}

/** 응답 본문을 받으며 진행률 보고 (0~99, 끝나면 호출자가 100) */
export async function readWithProgress(
  r: Response,
  fallbackLength: number,
  onProgress: (pct: number) => void,
  type: string,
): Promise<Blob> {
  if (!r.body) return r.blob()
  const len = Number(r.headers.get("content-length")) || fallbackLength
  const reader = r.body.getReader()
  const chunks: BlobPart[] = []
  let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    got += value.byteLength
    if (len > 0) onProgress(Math.min(99, (got / len) * 100))
  }
  return new Blob(chunks, { type })
}
