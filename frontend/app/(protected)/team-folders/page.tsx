"use client"

import { useState } from "react"
import Link from "next/link"
import { FolderTree, Plus, Users } from "lucide-react"

import { useApiGet } from "@/lib/hooks/use-api"
import { useAppContext } from "@/components/providers/app-context"
import { CreateTeamFolderModal } from "@/components/team-folders/create-team-folder-modal"
import type { TeamFolderItem } from "@/lib/types/api"

// 부서 소스(외부 디렉터리)를 없애 새 부서 폴더를 만들 수 없다 (ADR-0023,
// backend/app/services/departments.py). 메뉴에서도 숨김. 로컬 그룹 모델이 생기면 true.
const TEAM_FOLDERS_ENABLED = false

export default function TeamFoldersPage() {
  const { isWorkspaceAdmin } = useAppContext()
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
          <h1 className="text-2xl font-bold text-foreground">부서 폴더</h1>
          {TEAM_FOLDERS_ENABLED && isWorkspaceAdmin && (
            <button
              onClick={() => setCreating(true)}
              data-testid="team-folders-create-button"
              className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus size={15} /> 부서 폴더 만들기
            </button>
          )}
        </div>

        {!TEAM_FOLDERS_ENABLED && (
          <div
            className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-4 py-2 text-sm text-amber-800 dark:text-amber-200"
            data-testid="team-folders-disabled-notice"
          >
            부서 폴더는 현재 지원하지 않습니다.
          </div>
        )}

        {error ? (
          <div
            className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-700 dark:text-rose-300"
            data-testid="team-folders-error"
          >
            불러오지 못했습니다. 잠시 후 다시 시도해주세요.
          </div>
        ) : isLoading ? (
          <div className="text-sm text-muted-foreground">불러오는 중…</div>
        ) : folders.length === 0 ? (
          <div
            className="rounded-lg border border-dashed border-input p-12 text-center text-sm text-muted-foreground"
            data-testid="team-folders-empty"
          >
            소속된 부서 폴더가 없습니다.
          </div>
        ) : (
          <div
            className="overflow-hidden rounded-lg border border-border bg-card"
            data-testid="team-folders-list"
          >
            {folders.map((f) => (
              <Link
                key={f.node_id}
                href={`/files?scope=shared&folder=${f.node_id}&from=team-folders`}
                data-testid={`team-folder-${f.node_id}`}
                className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 hover:bg-muted/50"
              >
                <FolderTree size={18} className="shrink-0 text-blue-600 dark:text-blue-400" />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {f.name}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
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
