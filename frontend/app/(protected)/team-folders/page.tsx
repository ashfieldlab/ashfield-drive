"use client"

import { useState } from "react"
import Link from "next/link"
import { FolderTree, Plus, Users } from "lucide-react"

import { useApiGet } from "@/lib/hooks/use-api"
import { useAppContext } from "@/components/providers/app-context"
import { CreateTeamFolderModal } from "@/components/team-folders/create-team-folder-modal"
import type { TeamFolderItem } from "@/lib/types/api"

export default function TeamFoldersPage() {
  const { isCompanyAdmin } = useAppContext()
  const { data, error, isLoading } = useApiGet<TeamFolderItem[]>(
    "/api/v1/team-folders",
  )
  const [creating, setCreating] = useState(false)

  const folders = data ?? []

  return (
    <div
      className="h-full overflow-y-auto px-4 py-8 sm:px-6 lg:px-8"
      data-testid="team-folders-page"
    >
      <section className="min-w-0 flex-1 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">부서 폴더</h1>
          {isCompanyAdmin && (
            <button
              onClick={() => setCreating(true)}
              data-testid="team-folders-create-button"
              className="inline-flex items-center gap-1.5 rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              <Plus size={15} /> 부서 폴더 만들기
            </button>
          )}
        </div>

        {error ? (
          <div
            className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
            data-testid="team-folders-error"
          >
            불러오지 못했습니다. 잠시 후 다시 시도해주세요.
          </div>
        ) : isLoading ? (
          <div className="text-sm text-gray-500">불러오는 중…</div>
        ) : folders.length === 0 ? (
          <div
            className="rounded-lg border border-dashed border-gray-300 p-12 text-center text-sm text-gray-500"
            data-testid="team-folders-empty"
          >
            소속된 부서 폴더가 없습니다.
            {isCompanyAdmin && " 우측 상단에서 만들어 보세요."}
          </div>
        ) : (
          <div
            className="overflow-hidden rounded-lg border border-gray-200 bg-white"
            data-testid="team-folders-list"
          >
            {folders.map((f) => (
              <Link
                key={f.node_id}
                href={`/files?scope=shared&folder=${f.node_id}&from=team-folders`}
                data-testid={`team-folder-${f.node_id}`}
                className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 hover:bg-gray-50"
              >
                <FolderTree size={18} className="shrink-0 text-blue-600" />
                <span className="min-w-0 flex-1 truncate font-medium text-gray-900">
                  {f.name}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  <Users size={12} />
                  {f.department_name ?? f.department_id}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {creating && (
        <CreateTeamFolderModal
          onClose={() => setCreating(false)}
          onCreated={() => setCreating(false)}
        />
      )}
    </div>
  )
}
