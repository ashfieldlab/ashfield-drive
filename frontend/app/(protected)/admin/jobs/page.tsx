"use client"

import { Activity, AlertTriangle, CheckCircle2, CircleDashed, Loader2 } from "lucide-react"

import { useAppContext } from "@/components/providers/app-context"
import { useApiGet } from "@/lib/hooks/use-api"
import { relativeTime } from "@/lib/utils/audit-format"
import { formatDateTime } from "@/lib/utils/format"

interface JobRunOut {
  id: string
  name: string
  status: "running" | "ok" | "failed"
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  item_count: number | null
  error: string | null
}

interface JobSummary {
  name: string
  schedule: string
  last: JobRunOut | null
  recent: JobRunOut[]
}

interface JobsResponse {
  jobs: JobSummary[]
}

const URL = "/api/v1/admin/jobs"

type Health = "ok" | "failed" | "running" | "never"

function health(job: JobSummary): Health {
  if (!job.last) return "never"
  return job.last.status
}

const BADGE: Record<Health, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  ok: { label: "정상", cls: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60", Icon: CheckCircle2 },
  failed: { label: "실패", cls: "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/60", Icon: AlertTriangle },
  running: { label: "실행 중", cls: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/60", Icon: Loader2 },
  never: { label: "실행 기록 없음", cls: "bg-muted text-muted-foreground border-border", Icon: CircleDashed },
}

const DOT: Record<JobRunOut["status"], string> = {
  ok: "bg-emerald-400",
  failed: "bg-rose-500",
  running: "bg-blue-400",
}

export default function AdminJobsPage() {
  const { isSystemAdmin } = useAppContext()
  // 15초 자동 새로고침: 백그라운드 잡 상태를 살아있는 화면으로.
  const { data, error, isLoading } = useApiGet<JobsResponse>(
    isSystemAdmin ? URL : null,
    { refreshInterval: 15_000 },
  )

  if (!isSystemAdmin) {
    return (
      <div
        className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-6 text-sm text-amber-800 dark:text-amber-200"
        data-testid="admin-jobs-no-permission"
      >
        시스템 관리자만 접근할 수 있습니다.
      </div>
    )
  }

  const jobs = data?.jobs ?? []
  const failed = jobs.filter((j) => health(j) === "failed").length
  const never = jobs.filter((j) => health(j) === "never").length

  return (
    <div
      className="h-full overflow-y-auto px-4 py-8 sm:px-6 lg:px-8"
      data-testid="admin-jobs-page"
    >
      <header className="mb-4 flex items-center gap-2">
        <Activity size={20} className="text-muted-foreground" />
        <h1 className="text-2xl font-bold text-foreground">작업 모니터링</h1>
        {data && (
          <span className="ml-2 text-xs text-muted-foreground" data-testid="admin-jobs-summary">
            {failed > 0 && <b className="text-rose-600 dark:text-rose-400">실패 {failed}</b>}
            {failed > 0 && never > 0 && ", "}
            {never > 0 && <span className="text-muted-foreground">미실행 {never}</span>}
            {failed === 0 && never === 0 && <span className="text-emerald-600 dark:text-emerald-400">전부 정상</span>}
          </span>
        )}
      </header>

      {error ? (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-700 dark:text-rose-300">
          불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      ) : isLoading ? (
        <div className="text-sm text-muted-foreground">불러오는 중…</div>
      ) : (
        <div className="space-y-3" data-testid="admin-jobs-list">
          {jobs.map((job) => (
            <JobCard key={job.name} job={job} />
          ))}
        </div>
      )}
    </div>
  )
}

function JobCard({ job }: { job: JobSummary }) {
  const h = health(job)
  const badge = BADGE[h]
  const last = job.last

  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      data-testid={`admin-jobs-row-${job.name}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{job.name}</span>
            <span className="text-xs text-muted-foreground/70">{job.schedule}</span>
          </div>
          {last ? (
            <p className="mt-1 text-xs text-muted-foreground" title={formatDateTime(last.started_at)}>
              마지막 실행 {relativeTime(last.started_at)}
              {last.duration_ms != null && `, ${formatDuration(last.duration_ms)}`}
              {last.item_count != null && `, ${last.item_count}건`}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground/70">아직 실행된 적 없음</p>
          )}
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${badge.cls}`}
          data-testid={`admin-jobs-status-${job.name}`}
        >
          <badge.Icon size={12} className={h === "running" ? "animate-spin" : ""} />
          {badge.label}
        </span>
      </div>

      {last?.status === "failed" && last.error && (
        <pre className="mt-2 overflow-x-auto rounded bg-rose-50 dark:bg-rose-950/40 p-2 text-[11px] text-rose-700 dark:text-rose-300">
          {last.error}
        </pre>
      )}

      {job.recent.length > 0 && (
        <div className="mt-3 flex items-center gap-1" title="최근 실행 (오른쪽이 최신)">
          {[...job.recent].reverse().map((run) => (
            <span
              key={run.id}
              className={`h-2 w-2 rounded-sm ${DOT[run.status]}`}
              title={`${run.status}, ${formatDateTime(run.started_at)}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
