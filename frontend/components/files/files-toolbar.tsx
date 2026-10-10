"use client"

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { FolderPlus, FolderUp, RotateCw, Upload, X } from "lucide-react"

import { api } from "@/lib/api-client"
import { useToast } from "@/components/ui-custom/use-toast"
import { invalidateApi } from "@/lib/hooks/use-api"
import { logger } from "@/lib/utils/logger"
import * as e2e from "@/lib/e2e/session"
import type {
  NodeResponse,
  NodeScope,
  PartUrlResponse,
  UploadUrlResponse,
} from "@/lib/types/api"

interface Props {
  scope: NodeScope
  parentId: string | null
  // E2E vault (ADR-0016) — null 이면 일반(비암호) 폴더
  vaultRootId?: string | null
  ensureUnlocked?: () => Promise<void>
  showMakeVault?: boolean
  onMakeVault?: () => void
}

// 페이지(드롭존)가 드래그앤드롭으로 받은 항목을 이 툴바 로직으로 넘기기 위한 핸들.
export interface FilesToolbarHandle {
  handleDrop: (dt: DataTransfer) => Promise<void>
}

type UploadState = "uploading" | "success" | "failed"

// 폴더 업로드 단위 — relPath 는 "루트폴더/하위/파일.ext" 형식.
interface FolderItem {
  file: File
  relPath: string
}

type RetryPayload =
  | { kind: "file"; files: File[] }
  | { kind: "many"; files: File[] }
  | { kind: "folder"; items: FolderItem[] }

interface ProgressState {
  state: UploadState
  current: number
  total: number
  // 현재 처리 중인 파일의 byte 진행률 (0~100). multi-file 케이스도 "현재 파일" 기준.
  bytesPct?: number
  label: string
  startedAt: number
  errorMessage?: string
  retry?: RetryPayload
}

// S3 presigned URL PUT 은 byte 진행을 알아야 진행률(%) 표시 가능. fetch() 는
// upload progress 이벤트 미지원이라 XMLHttpRequest 사용. timeout 가드도 같이.
interface PutResult {
  ok: boolean
  status: number
  etag: string | null
}

interface PutOptions {
  contentType?: string
  timeoutMs?: number
  onProgress?: (loadedBytes: number, totalBytes: number) => void
}

function putWithProgress(
  url: string,
  body: Blob,
  opts: PutOptions = {},
): Promise<PutResult> {
  const timeoutMs = opts.timeoutMs ?? 120_000
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const timer = setTimeout(() => xhr.abort(), timeoutMs)
    if (opts.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts.onProgress!(e.loaded, e.total)
      }
    }
    xhr.onload = () => {
      clearTimeout(timer)
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        etag:
          xhr.getResponseHeader("ETag") ?? xhr.getResponseHeader("etag"),
      })
    }
    xhr.onerror = () => {
      clearTimeout(timer)
      reject(new Error("Network error"))
    }
    xhr.onabort = () => {
      clearTimeout(timer)
      reject(Object.assign(new Error("Upload aborted"), { name: "AbortError" }))
    }
    xhr.open("PUT", url)
    if (opts.contentType) xhr.setRequestHeader("Content-Type", opts.contentType)
    xhr.send(body)
  })
}

function toUploadError(e: unknown, label: string): Error {
  if (e instanceof DOMException && e.name === "AbortError") {
    return new Error(`업로드 시간 초과 (${label})`)
  }
  if (e instanceof Error) return e
  return new Error(String(e))
}

// --- 드래그앤드롭 폴더 트리 순회 (FileSystemEntry) ---
// dt.items 의 webkitGetAsEntry() 로 파일/폴더 구분. 폴더는 재귀로 relPath 부여.
function readAllEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  // readEntries 는 한 번에 최대 100개만 반환 — 빈 배열 나올 때까지 반복.
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = []
    const pump = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) return resolve(all)
        all.push(...batch)
        pump()
      }, reject)
    }
    pump()
  })
}

async function collectEntry(
  entry: FileSystemEntry,
  prefix: string,
  out: FolderItem[],
): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) =>
      (entry as FileSystemFileEntry).file(res, rej),
    )
    out.push({ file, relPath: prefix + file.name })
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const children = await readAllEntries(reader)
    for (const child of children) {
      await collectEntry(child, prefix + entry.name + "/", out)
    }
  }
}

export const FilesToolbar = forwardRef<FilesToolbarHandle, Props>(
  function FilesToolbar(
    {
      scope,
      parentId,
      vaultRootId = null,
      ensureUnlocked,
      showMakeVault = false,
      onMakeVault,
    },
    ref,
  ) {
    const { toast } = useToast()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const folderInputRef = useRef<HTMLInputElement>(null)
    const [newFolderOpen, setNewFolderOpen] = useState(false)
    const [folderName, setFolderName] = useState("")
    const [busy, setBusy] = useState(false)
    const [progress, setProgress] = useState<ProgressState | null>(null)
    const [elapsedSec, setElapsedSec] = useState(0)

    // uploading 상태일 때만 카운트다운 — 사용자가 hang 을 빨리 인지하도록.
    useEffect(() => {
      if (progress?.state !== "uploading") return
      setElapsedSec(Math.floor((Date.now() - progress.startedAt) / 1000))
      const id = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - progress.startedAt) / 1000))
      }, 1000)
      return () => clearInterval(id)
    }, [progress?.state, progress?.startedAt])

    function dismissProgress() {
      setProgress(null)
      setBusy(false)
    }

    async function uploadOne(
      file: File,
      parent: string | null,
      onBytes?: (pct: number) => void,
    ) {
      let pendingNodeId: string | null = null
      try {
        // E2E vault 면 업로드 전 암호화 — 본문/파일명은 암호문, DEK 는 wrap.
        // (일반 폴더는 원본 그대로.) 암호화 파일은 mime 미전송(노출 방지).
        let body: Blob = file
        let uploadName = file.name
        let wrappedDek: string | undefined
        let contentType: string | undefined = file.type || undefined
        if (vaultRootId) {
          await ensureUnlocked?.()
          const enc = await e2e.encryptForUpload(vaultRootId, file)
          body = enc.ciphertext
          uploadName = enc.encryptedName
          wrappedDek = enc.wrappedDek
          contentType = undefined
        }
        const total = body.size

        const presigned = await api<UploadUrlResponse>(
          "/api/v1/nodes/upload-url",
          {
            method: "POST",
            body: {
              parent_id: parent,
              name: uploadName,
              size: total,
              mime: vaultRootId ? null : file.type || null,
              scope,
              ...(wrappedDek ? { wrapped_dek: wrappedDek } : {}),
            },
          },
        )
        pendingNodeId = presigned.node_id

        if (presigned.multipart) {
          const partSize = presigned.part_size ?? 8 * 1024 * 1024
          const totalParts = Math.ceil(total / partSize)
          const parts: { PartNumber: number; ETag: string }[] = []
          let bytesDone = 0
          for (let i = 0; i < totalParts; i++) {
            const partNumber = i + 1
            const chunk = body.slice(i * partSize, (i + 1) * partSize)
            const { url } = await api<PartUrlResponse>(
              `/api/v1/nodes/${presigned.node_id}/parts/${partNumber}/url`,
              { method: "POST" },
            )
            const partStart = bytesDone
            const putRes = await putWithProgress(url, chunk, {
              onProgress: (loaded) =>
                onBytes?.(
                  Math.min(100, Math.round(((partStart + loaded) / total) * 100)),
                ),
            })
            if (!putRes.ok) throw new Error(`Part ${partNumber} PUT failed (${putRes.status})`)
            if (!putRes.etag) throw new Error(`Part ${partNumber} ETag missing`)
            parts.push({ PartNumber: partNumber, ETag: putRes.etag.replaceAll('"', "") })
            bytesDone += chunk.size
          }
          await api<NodeResponse>(
            `/api/v1/nodes/${presigned.node_id}/complete-multipart`,
            { method: "POST", body: { parts } },
          )
        } else {
          const putRes = await putWithProgress(presigned.upload_url!, body, {
            contentType,
            onProgress: (loaded, t) =>
              onBytes?.(Math.min(100, Math.round((loaded / t) * 100))),
          })
          if (!putRes.ok) throw new Error(`PUT failed (${putRes.status})`)
          await api<NodeResponse>(`/api/v1/nodes/${presigned.node_id}/complete`, {
            method: "POST",
          })
        }
      } catch (e) {
        if (pendingNodeId) {
          try {
            await api(`/api/v1/nodes/${pendingNodeId}`, { method: "DELETE" })
          } catch {
            // best-effort
          }
        }
        throw toUploadError(e, file.name)
      }
    }

    async function uploadFile(file: File) {
      setBusy(true)
      setProgress({
        state: "uploading",
        current: 0,
        total: 1,
        bytesPct: 0,
        label: file.name,
        startedAt: Date.now(),
      })
      try {
        await uploadOne(file, parentId, (pct) =>
          setProgress((p) =>
            p && p.state === "uploading" ? { ...p, bytesPct: pct } : p,
          ),
        )
        toast.success(`'${file.name}' 업로드했습니다`)
        invalidateApi("/api/v1/nodes")
        setProgress({
          state: "success",
          current: 1,
          total: 1,
          label: file.name,
          startedAt: Date.now(),
        })
        setBusy(false)
        // 성공 카드는 짧게 노출 후 자동 dismiss
        setTimeout(() => setProgress((p) => (p?.state === "success" ? null : p)), 2000)
      } catch (e) {
        const err = e as Error
        toast.error(`업로드 실패: ${err.message}`)
        invalidateApi("/api/v1/nodes")
        setProgress({
          state: "failed",
          current: 0,
          total: 1,
          label: file.name,
          startedAt: Date.now(),
          errorMessage: err.message,
          retry: { kind: "file", files: [file] },
        })
        setBusy(false)
      }
    }

    // 여러 개의 낱개 파일(폴더 구조 없음) — 현재 폴더에 평면 업로드. DnD 다중 파일용.
    async function uploadMany(files: File[]) {
      if (files.length === 1) return uploadFile(files[0])
      setBusy(true)
      const startedAt = Date.now()
      let okCount = 0
      const failedFiles: File[] = []
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        setProgress({
          state: "uploading",
          current: i,
          total: files.length,
          bytesPct: 0,
          label: f.name,
          startedAt,
        })
        try {
          await uploadOne(f, parentId, (pct) =>
            setProgress((p) =>
              p && p.state === "uploading" ? { ...p, bytesPct: pct } : p,
            ),
          )
          okCount++
        } catch (e) {
          failedFiles.push(f)
          logger.warn("upload_file_failed", { category: "biz", name: f.name, error: String(e) })
        }
      }
      invalidateApi("/api/v1/nodes")
      if (failedFiles.length === 0) {
        toast.success(`${okCount}개 파일을 업로드했습니다`)
        setProgress({
          state: "success",
          current: files.length,
          total: files.length,
          label: `${okCount}개 파일`,
          startedAt: Date.now(),
        })
        setBusy(false)
        setTimeout(() => setProgress((p) => (p?.state === "success" ? null : p)), 2000)
      } else {
        const msg = `${okCount}개 성공 · ${failedFiles.length}개 실패`
        toast.error(`업로드: ${msg}`)
        setProgress({
          state: "failed",
          current: okCount,
          total: files.length,
          label: msg,
          startedAt,
          errorMessage: `${failedFiles.length}개 실패, 재시도 가능`,
          retry: { kind: "many", files: failedFiles },
        })
        setBusy(false)
      }
    }

    // 폴더 트리 업로드 핵심 — relPath 로 폴더를 1회씩 생성 후 파일을 자기 부모에 업로드.
    async function runFolderUpload(items: FolderItem[]) {
      setBusy(true)
      const folderIdByPath = new Map<string, string | null>()
      folderIdByPath.set("", parentId)
      const startedAt = Date.now()
      try {
        // 1) 폴더 경로 수집 — 부모부터 정렬해 순서대로 생성.
        const folderPaths = new Set<string>()
        for (const it of items) {
          const parts = it.relPath.split("/")
          parts.pop() // 파일명 제외
          for (let i = 1; i <= parts.length; i++) {
            folderPaths.add(parts.slice(0, i).join("/"))
          }
        }
        const sorted = [...folderPaths].sort(
          (a, b) => a.split("/").length - b.split("/").length,
        )

        setProgress({
          state: "uploading",
          current: 0,
          total: sorted.length + items.length,
          label: "폴더 트리 생성",
          startedAt,
        })

        for (let i = 0; i < sorted.length; i++) {
          const path = sorted[i]
          const parts = path.split("/")
          const name = parts[parts.length - 1]
          const parentPath = parts.slice(0, -1).join("/")
          const folderParent = folderIdByPath.get(parentPath) ?? parentId
          const created = await api<NodeResponse>("/api/v1/nodes", {
            method: "POST",
            body: { parent_id: folderParent, name, scope },
          })
          folderIdByPath.set(path, created.id)
          setProgress({
            state: "uploading",
            current: i + 1,
            total: sorted.length + items.length,
            label: `폴더 생성: ${name}`,
            startedAt,
          })
        }

        // 2) 파일 업로드 — 각자 자기 부모 폴더 id 사용.
        let okCount = 0
        const failed: FolderItem[] = []
        for (let i = 0; i < items.length; i++) {
          const it = items[i]
          const parentPath = it.relPath.split("/").slice(0, -1).join("/")
          const targetParent = folderIdByPath.get(parentPath) ?? parentId
          setProgress({
            state: "uploading",
            current: sorted.length + i + 1,
            total: sorted.length + items.length,
            bytesPct: 0,
            label: it.file.name,
            startedAt,
          })
          try {
            await uploadOne(it.file, targetParent, (pct) =>
              setProgress((p) =>
                p && p.state === "uploading" ? { ...p, bytesPct: pct } : p,
              ),
            )
            okCount++
          } catch (e) {
            failed.push(it)
            logger.warn("upload_folder_file_failed", { category: "biz", name: it.file.name, error: String(e) })
          }
        }
        invalidateApi("/api/v1/nodes")
        if (failed.length === 0) {
          toast.success(`폴더를 업로드했습니다 (파일 ${okCount}개)`)
          setProgress({
            state: "success",
            current: items.length,
            total: items.length,
            label: `${okCount}개 파일`,
            startedAt: Date.now(),
          })
          setBusy(false)
          setTimeout(() => setProgress((p) => (p?.state === "success" ? null : p)), 2000)
        } else {
          const msg = `${okCount}개 성공 · ${failed.length}개 실패`
          toast.error(`폴더 업로드: ${msg}`)
          setProgress({
            state: "failed",
            current: okCount,
            total: items.length,
            label: msg,
            startedAt,
            errorMessage: `${failed.length}개 실패, 재시도 가능`,
            retry: { kind: "folder", items: failed },
          })
          setBusy(false)
        }
      } catch (e) {
        const err = e as Error
        toast.error(`폴더 업로드 실패: ${err.message}`)
        invalidateApi("/api/v1/nodes")
        setProgress({
          state: "failed",
          current: 0,
          total: items.length,
          label: "폴더 업로드 실패",
          startedAt,
          errorMessage: err.message,
          retry: { kind: "folder", items },
        })
        setBusy(false)
      }
    }

    // 폴더 <input> — webkitRelativePath 로 FolderItem 구성 후 공통 로직 호출.
    function uploadFolderInput(filesArg: FileList | File[]) {
      const files = Array.isArray(filesArg) ? filesArg : Array.from(filesArg)
      const items: FolderItem[] = files.map((f) => ({
        file: f,
        relPath:
          (f as File & { webkitRelativePath?: string }).webkitRelativePath ||
          f.name,
      }))
      void runFolderUpload(items)
    }

    // 드래그앤드롭 — 파일/폴더 혼합 가능. 폴더가 하나라도 있으면 폴더 업로드로,
    // 아니면 다중 파일 업로드로 처리.
    async function handleDrop(dt: DataTransfer) {
      const items = dt.items
      const entries: FileSystemEntry[] = []
      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry?.()
          if (entry) entries.push(entry)
        }
      }
      if (entries.length === 0) {
        // 엔트리 API 미지원 — 낱개 파일만.
        const files = Array.from(dt.files)
        if (files.length > 0) void uploadMany(files)
        return
      }
      const collected: FolderItem[] = []
      for (const e of entries) await collectEntry(e, "", collected)
      if (collected.length === 0) return
      // 폴더가 하나도 없으면 낱개 다중 파일 업로드, 있으면 트리 업로드.
      if (entries.some((e) => e.isDirectory)) {
        void runFolderUpload(collected)
      } else {
        void uploadMany(collected.map((c) => c.file))
      }
    }

    useImperativeHandle(ref, () => ({ handleDrop }))

    function handleRetry() {
      const retry = progress?.retry
      if (!retry) return
      if (retry.kind === "file") {
        void uploadFile(retry.files[0])
      } else if (retry.kind === "many") {
        void uploadMany(retry.files)
      } else {
        void runFolderUpload(retry.items)
      }
    }

    async function createFolder() {
      const name = folderName.trim()
      if (!name) return
      setBusy(true)
      try {
        // vault 안이면 폴더명도 암호화 (파일명과 동일 — ADR-0016 "파일명까지 암호화")
        let storedName = name
        if (vaultRootId) {
          await ensureUnlocked?.()
          storedName = await e2e.encryptName(vaultRootId, name)
        }
        await api<NodeResponse>("/api/v1/nodes", {
          method: "POST",
          body: { parent_id: parentId, name: storedName, scope },
        })
        toast.success(`'${name}' 폴더를 만들었습니다`)
        setNewFolderOpen(false)
        setFolderName("")
        invalidateApi("/api/v1/nodes")
      } catch (e) {
        toast.error(`폴더 생성 실패: ${(e as Error).message}`)
      } finally {
        setBusy(false)
      }
    }

    return (
      <div className="flex items-center gap-2">
        {showMakeVault && (
          <button
            type="button"
            data-testid="files-make-vault-button"
            disabled={busy}
            onClick={onMakeVault}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            🔒 보안 폴더로 전환
          </button>
        )}
        <button
          type="button"
          data-testid="files-upload-button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Upload size={14} />
          업로드
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          data-testid="files-upload-input"
          className="hidden"
          onChange={(e) => {
            const fl = e.target.files
            if (fl && fl.length > 0) void uploadMany(Array.from(fl))
            e.target.value = ""
          }}
        />

        <button
          type="button"
          data-testid="files-upload-folder-button"
          disabled={busy}
          onClick={() => folderInputRef.current?.click()}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <FolderUp size={14} />
          폴더 업로드
        </button>
        <input
          ref={folderInputRef}
          type="file"
          data-testid="files-upload-folder-input"
          className="hidden"
          // webkitdirectory·directory 는 표준 DOM 타입에 없어 spread 로 주입 (브라우저별 폴더 선택).
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          multiple
          onChange={(e) => {
            const fl = e.target.files
            if (fl && fl.length > 0) uploadFolderInput(fl)
            e.target.value = ""
          }}
        />

        <button
          type="button"
          data-testid="files-new-folder-button"
          disabled={busy}
          onClick={() => setNewFolderOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <FolderPlus size={14} />새 폴더
        </button>

        {newFolderOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
            onClick={() => setNewFolderOpen(false)}
          >
            <div
              className="w-80 rounded-lg bg-white p-5 shadow-lg"
              onClick={(e) => e.stopPropagation()}
              data-testid="files-new-folder-modal"
            >
              <h3 className="text-base font-semibold text-gray-900">새 폴더</h3>
              <input
                autoFocus
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void createFolder()
                  if (e.key === "Escape") setNewFolderOpen(false)
                }}
                placeholder="폴더 이름"
                data-testid="files-new-folder-input"
                className="mt-3 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setNewFolderOpen(false)}
                  data-testid="files-new-folder-cancel"
                  className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                >
                  취소
                </button>
                <button
                  onClick={createFolder}
                  disabled={busy || !folderName.trim()}
                  data-testid="files-new-folder-confirm"
                  className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  만들기
                </button>
              </div>
            </div>
          </div>
        )}

        {progress && (
          <div
            className={`fixed bottom-6 right-6 z-50 w-80 rounded-lg border p-4 shadow-lg ${
              progress.state === "failed"
                ? "border-rose-200 bg-rose-50"
                : progress.state === "success"
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-gray-200 bg-white"
            }`}
            data-testid="files-upload-progress"
            data-state={progress.state}
          >
            <div className="flex items-center justify-between text-sm">
              <span
                className={`font-medium ${
                  progress.state === "failed"
                    ? "text-rose-800"
                    : progress.state === "success"
                      ? "text-emerald-800"
                      : "text-gray-900"
                }`}
              >
                {progress.state === "failed"
                  ? "업로드 실패"
                  : progress.state === "success"
                    ? "업로드 완료"
                    : "업로드 중"}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  {progress.state === "uploading" ? `${elapsedSec}s · ` : ""}
                  {progress.current} / {progress.total}
                  {progress.state === "uploading" &&
                  progress.bytesPct !== undefined
                    ? ` · ${progress.bytesPct}%`
                    : ""}
                </span>
                <button
                  type="button"
                  onClick={dismissProgress}
                  title="닫기"
                  data-testid="files-upload-progress-dismiss"
                  className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <p
              className={`mt-1 truncate text-xs ${
                progress.state === "failed" ? "text-rose-700" : "text-gray-600"
              }`}
              title={progress.label}
            >
              {progress.label}
            </p>
            {progress.state === "failed" && progress.errorMessage && (
              <p className="mt-0.5 truncate text-xs text-rose-600" title={progress.errorMessage}>
                {progress.errorMessage}
              </p>
            )}
            {progress.state === "uploading" && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full bg-gray-900 transition-all"
                  style={{
                    // 단일 파일: byte 진행률. 다파일/폴더: 파일-개수 진행률 (bytesPct 무시).
                    width:
                      progress.total === 1 && progress.bytesPct !== undefined
                        ? `${progress.bytesPct}%`
                        : `${Math.min(100, (progress.current / Math.max(1, progress.total)) * 100)}%`,
                  }}
                />
              </div>
            )}
            {progress.state === "failed" && progress.retry && (
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={dismissProgress}
                  data-testid="files-upload-progress-cancel"
                  className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={handleRetry}
                  data-testid="files-upload-progress-retry"
                  className="inline-flex items-center gap-1 rounded bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-800"
                >
                  <RotateCw size={12} />
                  재시도
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  },
)
