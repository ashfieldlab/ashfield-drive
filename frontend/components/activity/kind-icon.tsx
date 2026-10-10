import {
  Archive,
  File,
  FileCode,
  FileImage,
  FileMusic,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  Presentation,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { FileKind } from "@/lib/utils/audit-format"

export const KIND_META: Record<FileKind, { icon: LucideIcon; tone: string; label: string }> = {
  folder: { icon: Folder, tone: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300", label: "폴더" },
  image: { icon: FileImage, tone: "bg-pink-50 text-pink-600 dark:bg-pink-950/50 dark:text-pink-300", label: "이미지" },
  pdf: { icon: FileText, tone: "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300", label: "PDF" },
  doc: { icon: FileText, tone: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300", label: "문서" },
  sheet: { icon: FileSpreadsheet, tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300", label: "스프레드시트" },
  slide: { icon: Presentation, tone: "bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-300", label: "프레젠테이션" },
  video: { icon: FileVideo, tone: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300", label: "동영상" },
  audio: { icon: FileMusic, tone: "bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-300", label: "오디오" },
  archive: { icon: Archive, tone: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300", label: "압축 파일" },
  code: { icon: FileCode, tone: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300", label: "코드" },
  text: { icon: File, tone: "bg-muted text-muted-foreground", label: "파일" },
}

export function KindIcon({
  kind,
  className,
  iconClassName,
}: {
  kind: FileKind
  className?: string
  iconClassName?: string
}) {
  const m = KIND_META[kind]
  const Icon = m.icon
  return (
    <span className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-md", m.tone, className)}>
      <Icon className={cn("size-4", iconClassName)} />
    </span>
  )
}
