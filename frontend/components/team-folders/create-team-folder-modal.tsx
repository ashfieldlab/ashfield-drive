"use client"

import { useMemo, useState } from "react"
import { X } from "lucide-react"

import { useToast } from "@/components/ui-custom/use-toast"
import { api } from "@/lib/api-client"
import { invalidateApi, useApiGet } from "@/lib/hooks/use-api"
import { useAppContext } from "@/components/providers/app-context"
import type { GroupDept } from "@/lib/types/api"

interface Props {
  onClose: () => void
  onCreated: () => void
}

/** 관리자: 부서 선택 + 이름 → 팀(부서) 폴더 생성 (docs/group-sharing.html 4단계). */
export function CreateTeamFolderModal({ onClose, onCreated }: Props) {
  const { toast } = useToast()
  const { activeCompanyId } = useAppContext()
  const { data: depts } = useApiGet<GroupDept[]>("/api/v1/groups")
  const [departmentId, setDepartmentId] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)

  // 활성 회사의 부서만. 본부→팀 깊이 들여쓰기로 트리 느낌.
  const options = useMemo(() => {
    const rows = (depts ?? []).filter((d) => d.company === activeCompanyId)
    const byId = new Map(rows.map((d) => [d.department_id, d]))
    const byName = new Map(rows.map((d) => [d.department, d]))
    const depth = (d: GroupDept): number => {
      let n = 0
      let cur: GroupDept | undefined = d
      const seen = new Set<string>()
      while (cur?.parent && !seen.has(cur.department_id)) {
        seen.add(cur.department_id)
        cur = byName.get(cur.parent)
        n += 1
      }
      return n
    }
    void byId
    return rows
      .map((d) => ({ ...d, _depth: depth(d) }))
      .sort((a, b) => a.department.localeCompare(b.department))
  }, [depts, activeCompanyId])

  async function submit() {
    if (!departmentId || !name.trim()) return
    setBusy(true)
    try {
      await api("/api/v1/team-folders", {
        method: "POST",
        body: { department_id: departmentId, name: name.trim() },
      })
      toast.success("부서 폴더를 만들었습니다")
      invalidateApi("/api/v1/team-folders")
      onCreated()
    } catch (e) {
      toast.error(`생성 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="w-[460px] max-w-[92vw] rounded-lg bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
        data-testid="team-folder-create-modal"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">부서 폴더 만들기</h2>
          <button
            onClick={onClose}
            data-testid="team-folder-create-close"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">부서</label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              data-testid="team-folder-create-department"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">부서 선택…</option>
              {options.map((d) => (
                <option key={d.department_id} value={d.department_id}>
                  {" ".repeat(d._depth * 2)}
                  {d.department} ({d.member_count})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              선택한 부서와 그 하위 부서 인원이 접근합니다.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">폴더 이름</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 플랫폼개발팀 공용"
              data-testid="team-folder-create-name"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button
            onClick={onClose}
            data-testid="team-folder-create-cancel"
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={busy || !departmentId || !name.trim()}
            data-testid="team-folder-create-submit"
            className="rounded bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? "생성 중…" : "만들기"}
          </button>
        </div>
      </div>
    </div>
  )
}
