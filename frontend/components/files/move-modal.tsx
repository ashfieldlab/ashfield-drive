"use client"

import { useMemo, useState } from "react"
import { Folder, FolderUp, X } from "lucide-react"
import { useToast } from "@/components/ui-custom/use-toast"

import { api } from "@/lib/api-client"
import { invalidateApi, useApiGet } from "@/lib/hooks/use-api"
import type { NodeResponse, TreeResponse } from "@/lib/types/api"

/**
 * 파일/폴더 이동 목적지 선택 — 같은 scope 의 폴더 트리에서 고른다.
 * 자기 자신 + 자손 폴더는 제외(순환 방지). 이동은 PATCH /nodes {parent_id}.
 */
export function MoveModal({
  node,
  onClose,
}: {
  node: NodeResponse
  onClose: () => void
}) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const { data, isLoading } = useApiGet<TreeResponse>(
    `/api/v1/nodes/tree?scope=${node.scope}&recursive=true`,
  )
  const allNodes = useMemo(() => data?.nodes ?? [], [data])

  // 자기 자신 + 자손 = 목적지 제외
  const excluded = useMemo(() => {
    const set = new Set<string>([node.id])
    let changed = true
    while (changed) {
      changed = false
      for (const n of allNodes) {
        if (n.parent_id && set.has(n.parent_id) && !set.has(n.id)) {
          set.add(n.id)
          changed = true
        }
      }
    }
    return set
  }, [allNodes, node.id])

  // 목적지 폴더 트리 순서(부모 먼저) + depth
  const ordered = useMemo(() => {
    const byParent = new Map<string | null, NodeResponse[]>()
    for (const n of allNodes) {
      if (n.kind !== "folder" || excluded.has(n.id)) continue
      const key = n.parent_id
      if (!byParent.has(key)) byParent.set(key, [])
      byParent.get(key)!.push(n)
    }
    for (const arr of byParent.values())
      arr.sort((a, b) => a.name.localeCompare(b.name))
    const out: { node: NodeResponse; depth: number }[] = []
    const walk = (parentId: string | null, depth: number) => {
      for (const n of byParent.get(parentId) ?? []) {
        out.push({ node: n, depth })
        walk(n.id, depth + 1)
      }
    }
    walk(null, 0)
    return out
  }, [allNodes, excluded])

  async function move(parentId: string | null) {
    if (parentId === node.parent_id) {
      onClose()
      return
    }
    setBusy(true)
    try {
      await api(`/api/v1/nodes/${node.id}`, {
        method: "PATCH",
        body: { parent_id: parentId },
      })
      toast.success("이동했습니다")
      invalidateApi("/api/v1/nodes")
      onClose()
    } catch (e) {
      toast.error(`이동 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={() => !busy && onClose()}
    >
      <div
        className="flex max-h-[80vh] w-96 max-w-[92vw] flex-col overflow-hidden rounded-lg bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
        data-testid="files-move-modal"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="min-w-0 truncate text-base font-semibold text-gray-900">
            {node.name} 이동
          </h3>
          <button
            onClick={onClose}
            data-testid="files-move-close"
            className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto p-2">
          <button
            onClick={() => move(null)}
            disabled={busy || node.parent_id === null}
            data-testid="files-move-root"
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-40"
          >
            <FolderUp size={14} className="shrink-0 text-gray-500" /> (최상위)
          </button>
          {isLoading ? (
            <p className="px-3 py-6 text-center text-xs text-gray-500">불러오는 중…</p>
          ) : (
            ordered.map(({ node: f, depth }) => (
              <button
                key={f.id}
                onClick={() => move(f.id)}
                disabled={busy || f.id === node.parent_id}
                data-testid={`files-move-target-${f.id}`}
                style={{ paddingLeft: `${0.75 + depth}rem` }}
                className="flex w-full items-center gap-2 rounded py-2 pr-3 text-left text-sm hover:bg-gray-50 disabled:opacity-40"
              >
                <Folder size={14} className="shrink-0 text-blue-600" />
                <span className="truncate">{f.name}</span>
              </button>
            ))
          )}
          {!isLoading && ordered.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-gray-500">
              이동할 다른 폴더가 없습니다.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
