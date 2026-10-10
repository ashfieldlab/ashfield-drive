"use client"

/**
 * 업로드 큐: 모듈 단위 저장소 (useSyncExternalStore 로 구독, Context provider 아님).
 *
 * 폴더나 화면을 옮겨도 큐가 살아 있도록 컴포넌트 밖에 둔다. 실제 전송도 여기서:
 *   - presigned 단일 PUT 또는 multipart (파트별 presigned URL)
 *   - 보안 폴더(ADR-0016)면 업로드 전 암호화: 본문, 파일명, 폴더명. DEK 는 wrap 해 함께 보냄
 *   - 동시에 CONCURRENCY 개, 취소(XHR abort + pending 노드 정리), 재시도(폴더는 실패한 파일만)
 *
 * 보안 폴더 잠금해제는 화면(useE2E 모달) 책임: 큐에 넣기 전에 호출측이 ensureUnlocked 를 마친다.
 * 키는 lib/e2e/session 모듈 메모리에 있어 화면을 떠나도 계속 암호화할 수 있다.
 */

import { useSyncExternalStore } from "react"

import { api } from "@/lib/api-client"
import { COOKIES } from "@/lib/cookies"
import * as e2e from "@/lib/e2e/session"
import { invalidateApi } from "@/lib/hooks/use-api"
import { logger } from "@/lib/utils/logger"
import type { NodeResponse, NodeScope, PartUrlResponse, UploadUrlResponse } from "@/lib/types/api"

import type { DropBatch, FolderItem } from "./drop"
import type { UploadLike, UploadState } from "./view"

export type { UploadState } from "./view"

const CONCURRENCY = 3
/** 진행률 알림 간격: XHR progress 마다 다시 그리지 않도록 */
const EMIT_MS = 150
const PUT_TIMEOUT_MS = 120_000

export interface UploadDest {
  workspaceId: string | null
  scope: NodeScope
  /** null 이면 scope 루트 */
  parentId: string | null
  /** 보안 폴더 루트 (없으면 일반 폴더) */
  vaultRootId: string | null
  /** 사이드바 팝오버에 보이는 목적지 이름 */
  label: string
  /** 목적지 폴더 주소 */
  href: string
}

export function destKeyOf(d: Pick<UploadDest, "workspaceId" | "scope" | "parentId">): string {
  return `${d.workspaceId ?? ""}:${d.scope}:${d.parentId ?? "root"}`
}

export interface UploadChild {
  path: string
  state: Exclude<UploadState, "canceled">
}

export interface UploadItem extends UploadLike {
  id: string
  kind: "file" | "folder"
  name: string
  mime: string | null
  dest: UploadDest
  destKey: string
  error?: string
  /** 폴더 업로드: 하위 파일 (relPath 는 루트 폴더 아래 경로) */
  children?: UploadChild[]
  filesDone?: number
  /** 만들어진 노드: 파일은 pending 노드, 폴더는 루트 폴더. 진행 중엔 목록에서 숨기고 끝나면 "새 항목" */
  nodeId?: string | null
  finishedAt?: number
}

interface Job {
  file?: File
  folderItems?: FolderItem[]
  /** 폴더 업로드에서 끝난 파일 (재시도 때 건너뜀) */
  doneIdx: Set<number>
  /** 폴더 경로("루트/하위") → 만든 노드 id (재시도 때 다시 만들지 않음) */
  folderIds: Map<string, string>
  xhr: XMLHttpRequest | null
  canceled: boolean
  lastT: number
  lastLoaded: number
}

// ---------------------------------------------------------------------------
// 상태와 구독
// ---------------------------------------------------------------------------

let items: UploadItem[] = []
const jobs = new Map<string, Job>()
const listeners = new Set<() => void>()
let seq = 0
let emitTimer: ReturnType<typeof setTimeout> | null = null
const EMPTY: UploadItem[] = []

function emit() {
  if (emitTimer) {
    clearTimeout(emitTimer)
    emitTimer = null
  }
  for (const l of listeners) l()
}

function emitSoon() {
  if (emitTimer) return
  emitTimer = setTimeout(emit, EMIT_MS)
}

function patch(id: string, p: Partial<UploadItem> | ((u: UploadItem) => Partial<UploadItem>), now = true) {
  items = items.map((u) => (u.id === id ? { ...u, ...(typeof p === "function" ? p(u) : p) } : u))
  if (now) emit()
  else emitSoon()
}

function get(id: string): UploadItem | undefined {
  return items.find((u) => u.id === id)
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getUploads(): UploadItem[] {
  return items
}

export function useUploads(): UploadItem[] {
  return useSyncExternalStore(subscribe, getUploads, () => EMPTY)
}

function isActive(u: UploadItem) {
  return u.state === "queued" || u.state === "uploading"
}

// 진행 중이면 창 닫기/새로고침 전에 묻는다.
let unloadGuard = false
function ensureUnloadGuard() {
  if (unloadGuard || typeof window === "undefined") return
  unloadGuard = true
  window.addEventListener("beforeunload", (e) => {
    if (items.some(isActive)) {
      e.preventDefault()
      e.returnValue = ""
    }
  })
}

// ---------------------------------------------------------------------------
// 큐 조작
// ---------------------------------------------------------------------------

function newJob(): Job {
  return { doneIdx: new Set(), folderIds: new Map(), xhr: null, canceled: false, lastT: 0, lastLoaded: 0 }
}

function nextId() {
  seq += 1
  return `up-${Date.now().toString(36)}-${seq}`
}

export function enqueueFiles(files: File[], dest: UploadDest): void {
  if (files.length === 0) return
  const added: UploadItem[] = files.map((f) => {
    const id = nextId()
    jobs.set(id, { ...newJob(), file: f })
    return {
      id,
      kind: "file",
      name: f.name,
      mime: f.type || null,
      size: f.size,
      loaded: 0,
      speed: 0,
      state: "queued",
      dest,
      destKey: destKeyOf(dest),
    }
  })
  items = [...items, ...added]
  ensureUnloadGuard()
  emit()
  pump()
}

/** 폴더 하나(최상위 이름 name)를 한 행으로. items 의 relPath 는 "name/..." 형식 */
export function enqueueFolder(name: string, folderItems: FolderItem[], dest: UploadDest): void {
  const id = nextId()
  jobs.set(id, { ...newJob(), folderItems })
  const prefix = name + "/"
  items = [
    ...items,
    {
      id,
      kind: "folder",
      name,
      mime: null,
      size: folderItems.reduce((s, it) => s + it.file.size, 0),
      loaded: 0,
      speed: 0,
      state: "queued",
      dest,
      destKey: destKeyOf(dest),
      filesDone: 0,
      children: folderItems.map((it) => ({
        path: it.relPath.startsWith(prefix) ? it.relPath.slice(prefix.length) : it.relPath,
        state: "queued",
      })),
    },
  ]
  ensureUnloadGuard()
  emit()
  pump()
}

export function enqueueBatch(batch: DropBatch, dest: UploadDest): void {
  for (const f of batch.folders) enqueueFolder(f.name, f.items, dest)
  enqueueFiles(batch.files, dest)
}

export function cancel(id: string): void {
  const u = get(id)
  const job = jobs.get(id)
  if (!u || !job || !isActive(u)) return
  job.canceled = true
  job.xhr?.abort()
  if (u.state === "queued") patch(id, { state: "canceled", speed: 0 })
  // uploading 이면 run() 이 abort 를 받아 canceled 로 정리
}

export function retry(id: string): void {
  const u = get(id)
  const job = jobs.get(id)
  if (!u || !job || (u.state !== "failed" && u.state !== "canceled")) return
  job.canceled = false
  patch(id, (cur) => ({
    state: "queued",
    error: undefined,
    speed: 0,
    // 파일은 처음부터, 폴더는 끝난 파일 몫을 유지
    loaded: cur.kind === "folder" ? doneBytes(cur, job) : 0,
    children: cur.children?.map((c) => (c.state === "failed" ? { ...c, state: "queued" } : c)),
  }))
  pump()
}

export function retryAll(): void {
  for (const u of items) if (u.state === "failed") retry(u.id)
}

/** 끝난 항목(완료, 취소) 정리. 실패는 남긴다 */
export function clearFinished(): void {
  const keep = items.filter((u) => u.state !== "done" && u.state !== "canceled")
  for (const u of items) if (!keep.includes(u)) jobs.delete(u.id)
  items = keep
  emit()
}

/** 모두 지우기 (진행 중은 취소) */
export function clearAll(): void {
  for (const u of items) if (isActive(u)) cancel(u.id)
  items = items.filter(isActive)
  for (const id of [...jobs.keys()]) if (!items.some((u) => u.id === id)) jobs.delete(id)
  emit()
}

function doneBytes(u: UploadItem, job: Job): number {
  if (!job.folderItems) return 0
  let s = 0
  for (const i of job.doneIdx) s += job.folderItems[i]?.file.size ?? 0
  return Math.min(s, u.size)
}

// ---------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------

function pump() {
  let running = items.filter((u) => u.state === "uploading").length
  for (const u of items) {
    if (running >= CONCURRENCY) break
    if (u.state !== "queued") continue
    running += 1
    patch(u.id, { state: "uploading", speed: 0 })
    void run(u.id)
  }
}

async function run(id: string) {
  const job = jobs.get(id)
  const u = get(id)
  if (!job || !u) return
  job.lastT = performance.now()
  job.lastLoaded = u.loaded
  try {
    assertWorkspace(u.dest)
    if (u.kind === "file") await runFile(u, job)
    else await runFolder(u, job)
    patch(id, { state: "done", loaded: u.size, speed: 0, finishedAt: Date.now() })
  } catch (e) {
    if (job.canceled) {
      patch(id, { state: "canceled", speed: 0 })
    } else {
      const msg = toMessage(e)
      logger.warn("upload_failed", { category: "biz", kind: u.kind, error: msg })
      patch(id, { state: "failed", speed: 0, error: msg })
    }
  } finally {
    job.xhr = null
    invalidateApi("/api/v1/nodes")
    invalidateApi("/api/v1/me")
    pump()
  }
}

function onProgress(id: string, job: Job, loaded: number) {
  const now = performance.now()
  const dt = now - job.lastT
  patch(
    id,
    (cur) => {
      if (dt < 400) return { loaded }
      const inst = Math.max(0, ((loaded - job.lastLoaded) / dt) * 1000)
      job.lastT = now
      job.lastLoaded = loaded
      return { loaded, speed: cur.speed > 0 ? cur.speed * 0.6 + inst * 0.4 : inst }
    },
    false,
  )
}

async function runFile(u: UploadItem, job: Job) {
  const file = job.file!
  await uploadBlob(file, u.dest.parentId, u.dest, job, {
    onNode: (nodeId) => patch(u.id, { nodeId }),
    onBytes: (frac) => onProgress(u.id, job, Math.round(frac * file.size)),
  })
}

async function runFolder(u: UploadItem, job: Job) {
  const list = job.folderItems!
  const dest = u.dest
  // 1) 폴더 경로: 부모부터 차례로 만든다 (재시도면 이미 만든 것은 건너뜀)
  const paths = new Set<string>()
  for (const it of list) {
    const parts = it.relPath.split("/")
    parts.pop()
    for (let i = 1; i <= parts.length; i++) paths.add(parts.slice(0, i).join("/"))
  }
  const sorted = [...paths].sort((a, b) => a.split("/").length - b.split("/").length)
  for (const path of sorted) {
    if (job.canceled) throw abortError()
    if (job.folderIds.has(path)) continue
    const parts = path.split("/")
    const name = parts[parts.length - 1]
    const parentPath = parts.slice(0, -1).join("/")
    const parent = parentPath ? job.folderIds.get(parentPath) ?? null : dest.parentId
    const stored = dest.vaultRootId ? await e2e.encryptName(dest.vaultRootId, name) : name
    const created = await api<NodeResponse>("/api/v1/nodes", {
      method: "POST",
      body: { parent_id: parent, name: stored, scope: dest.scope },
    })
    job.folderIds.set(path, created.id)
    if (!parentPath) patch(u.id, { nodeId: created.id })
  }

  // 2) 파일: 각자 자기 부모 폴더로. 하나가 실패해도 나머지는 계속
  let failed = 0
  for (let i = 0; i < list.length; i++) {
    if (job.canceled) throw abortError()
    if (job.doneIdx.has(i)) continue
    const it = list[i]
    const dir = it.relPath.split("/").slice(0, -1).join("/")
    const parent = job.folderIds.get(dir) ?? dest.parentId
    const base = doneBytes(u, job)
    setChild(u.id, i, "uploading")
    try {
      await uploadBlob(it.file, parent, dest, job, {
        onBytes: (frac) => onProgress(u.id, job, base + Math.round(frac * it.file.size)),
      })
      job.doneIdx.add(i)
      setChild(u.id, i, "done")
      patch(u.id, { filesDone: job.doneIdx.size, loaded: doneBytes(u, job) })
    } catch (e) {
      if (job.canceled) throw e
      failed += 1
      setChild(u.id, i, "failed")
      logger.warn("upload_folder_file_failed", { category: "biz", error: toMessage(e) })
    }
  }
  if (failed > 0) throw new Error(`${failed}개 실패`)
}

function setChild(id: string, idx: number, state: UploadChild["state"]) {
  patch(id, (cur) => ({
    children: cur.children?.map((c, i) => (i === idx ? { ...c, state } : c)),
  }))
}

interface BlobHooks {
  onNode?: (nodeId: string) => void
  /** 0..1 */
  onBytes?: (frac: number) => void
}

/** 파일 하나를 parent 에 올린다. 실패나 취소면 만든 pending 노드를 지운다 (best-effort) */
async function uploadBlob(file: File, parent: string | null, dest: UploadDest, job: Job, hooks: BlobHooks) {
  let pendingNodeId: string | null = null
  try {
    // 보안 폴더면 업로드 전 암호화: 본문과 파일명은 암호문, DEK 는 wrap. mime 은 보내지 않음(노출 방지).
    let body: Blob = file
    let uploadName = file.name
    let wrappedDek: string | undefined
    let contentType: string | undefined = file.type || undefined
    if (dest.vaultRootId) {
      const enc = await e2e.encryptForUpload(dest.vaultRootId, file)
      body = enc.ciphertext
      uploadName = enc.encryptedName
      wrappedDek = enc.wrappedDek
      contentType = undefined
    }
    if (job.canceled) throw abortError()
    const total = body.size

    const presigned = await api<UploadUrlResponse>("/api/v1/nodes/upload-url", {
      method: "POST",
      body: {
        parent_id: parent,
        name: uploadName,
        size: total,
        mime: dest.vaultRootId ? null : file.type || null,
        scope: dest.scope,
        ...(wrappedDek ? { wrapped_dek: wrappedDek } : {}),
      },
    })
    pendingNodeId = presigned.node_id
    hooks.onNode?.(presigned.node_id)

    if (presigned.multipart) {
      const partSize = presigned.part_size ?? 8 * 1024 * 1024
      const totalParts = Math.ceil(total / partSize)
      const parts: { PartNumber: number; ETag: string }[] = []
      let bytesDone = 0
      for (let i = 0; i < totalParts; i++) {
        if (job.canceled) throw abortError()
        const partNumber = i + 1
        const chunk = body.slice(i * partSize, (i + 1) * partSize)
        const { url } = await api<PartUrlResponse>(
          `/api/v1/nodes/${presigned.node_id}/parts/${partNumber}/url`,
          { method: "POST" },
        )
        const partStart = bytesDone
        const res = await putWithProgress(url, chunk, job, {
          onProgress: (loaded) => hooks.onBytes?.(Math.min(1, (partStart + loaded) / total)),
        })
        if (!res.ok) throw new Error(`Part ${partNumber} PUT failed (${res.status})`)
        if (!res.etag) throw new Error(`Part ${partNumber} ETag missing`)
        parts.push({ PartNumber: partNumber, ETag: res.etag.replaceAll('"', "") })
        bytesDone += chunk.size
      }
      await api<NodeResponse>(`/api/v1/nodes/${presigned.node_id}/complete-multipart`, {
        method: "POST",
        body: { parts },
      })
    } else {
      const res = await putWithProgress(presigned.upload_url!, body, job, {
        contentType,
        onProgress: (loaded, t) => hooks.onBytes?.(t ? Math.min(1, loaded / t) : 0),
      })
      if (!res.ok) throw new Error(`PUT failed (${res.status})`)
      await api<NodeResponse>(`/api/v1/nodes/${presigned.node_id}/complete`, { method: "POST" })
    }
    hooks.onBytes?.(1)
  } catch (e) {
    if (pendingNodeId) {
      try {
        await api(`/api/v1/nodes/${pendingNodeId}`, { method: "DELETE" })
      } catch {
        // best-effort
      }
    }
    throw e
  }
}

interface PutResult {
  ok: boolean
  status: number
  etag: string | null
}

// presigned PUT 은 byte 진행을 알아야 해서 fetch 대신 XMLHttpRequest (upload progress 이벤트).
function putWithProgress(
  url: string,
  body: Blob,
  job: Job,
  opts: { contentType?: string; onProgress?: (loaded: number, total: number) => void },
): Promise<PutResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    job.xhr = xhr
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      xhr.abort()
    }, PUT_TIMEOUT_MS)
    if (opts.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts.onProgress!(e.loaded, e.total)
      }
    }
    xhr.onload = () => {
      clearTimeout(timer)
      job.xhr = null
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        etag: xhr.getResponseHeader("ETag") ?? xhr.getResponseHeader("etag"),
      })
    }
    xhr.onerror = () => {
      clearTimeout(timer)
      job.xhr = null
      reject(new Error("네트워크 오류"))
    }
    xhr.onabort = () => {
      clearTimeout(timer)
      job.xhr = null
      reject(timedOut ? new Error("시간 초과") : abortError())
    }
    xhr.open("PUT", url)
    if (opts.contentType) xhr.setRequestHeader("Content-Type", opts.contentType)
    xhr.send(body)
  })
}

function abortError(): Error {
  return Object.assign(new Error("취소됨"), { name: "AbortError" })
}

function toMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

function readActiveWorkspace(): string | null {
  if (typeof document === "undefined") return null
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIES.activeWorkspace}=([^;]+)`))
  return m ? decodeURIComponent(m[1]) : null
}

// api() 는 요청 시점의 활성 워크스페이스 쿠키를 붙인다. 큐가 도는 사이 워크스페이스를
// 바꾸면 엉뚱한 곳에 올라가므로, 시작 때 확인하고 다르면 실패로 남긴다 (돌아와서 재시도).
function assertWorkspace(dest: UploadDest) {
  const cur = readActiveWorkspace()
  if (dest.workspaceId && cur && cur !== dest.workspaceId) {
    throw new Error("다른 워크스페이스로 바뀜")
  }
}
