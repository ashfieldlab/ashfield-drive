"use client"

/**
 * "새로 만들기" 메뉴: 새 폴더, 파일 업로드, 폴더 업로드.
 * 업로드 자체는 lib/uploads/store 큐 (호출측 onUpload 가 목적지를 붙여 넣는다).
 */

import { useRef, useState } from "react"
import { FolderPlus, FolderUp, Plus, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { api } from "@/lib/api-client"
import { useToast } from "@/components/ui-custom/use-toast"
import { invalidateApi } from "@/lib/hooks/use-api"
import * as e2e from "@/lib/e2e/session"
import { readFolderInput, type DropBatch } from "@/lib/uploads/drop"
import type { NodeResponse, NodeScope } from "@/lib/types/api"

interface Props {
  scope: NodeScope
  parentId: string | null
  // E2E vault (ADR-0016): null 이면 일반(비암호) 폴더
  vaultRootId?: string | null
  ensureUnlocked?: () => Promise<void>
  onUpload: (batch: DropBatch) => void
}

export function FilesNewMenu({ scope, parentId, vaultRootId = null, ensureUnlocked, onUpload }: Props) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [folderName, setFolderName] = useState("")
  const [busy, setBusy] = useState(false)

  async function createFolder() {
    const name = folderName.trim()
    if (!name) return
    setBusy(true)
    try {
      // vault 안이면 폴더명도 암호화 (파일명과 동일: ADR-0016 "파일명까지 암호화")
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
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button data-testid="files-new-button">
            <Plus />
            새로 만들기
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem data-testid="files-new-folder-button" onSelect={() => setNewFolderOpen(true)}>
            <FolderPlus />
            새 폴더
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem data-testid="files-upload-button" onSelect={() => fileInputRef.current?.click()}>
            <Upload />
            파일 업로드
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="files-upload-folder-button" onSelect={() => folderInputRef.current?.click()}>
            <FolderUp />
            폴더 업로드
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        data-testid="files-upload-input"
        className="hidden"
        onChange={(e) => {
          const fl = e.target.files
          if (fl && fl.length > 0) onUpload({ files: Array.from(fl), folders: [] })
          e.target.value = ""
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        data-testid="files-upload-folder-input"
        className="hidden"
        // webkitdirectory, directory 는 표준 DOM 타입에 없어 spread 로 주입 (브라우저별 폴더 선택).
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        multiple
        onChange={(e) => {
          const fl = e.target.files
          if (fl && fl.length > 0) onUpload(readFolderInput(fl))
          e.target.value = ""
        }}
      />

      <Dialog open={newFolderOpen} onOpenChange={(o) => !busy && setNewFolderOpen(o)}>
        <DialogContent className="sm:max-w-sm" data-testid="files-new-folder-modal" showCloseButton={false} aria-describedby={undefined}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void createFolder()
            }}
            className="grid gap-4"
          >
            <DialogHeader>
              <DialogTitle>새 폴더</DialogTitle>
            </DialogHeader>
            <input
              autoFocus
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="폴더 이름"
              data-testid="files-new-folder-input"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setNewFolderOpen(false)}
                data-testid="files-new-folder-cancel"
              >
                취소
              </Button>
              <Button type="submit" disabled={busy || !folderName.trim()} data-testid="files-new-folder-confirm">
                만들기
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
