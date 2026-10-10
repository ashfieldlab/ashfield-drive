import type { ComponentType } from "react"

import { FilesPageItem, filesPageVariants } from "./files-page"
import { FilePreviewItem, filePreviewVariants } from "./file-preview"
import { UploadItem, uploadVariants } from "./upload"
import { ActivityPageItem, activityPageVariants } from "./activity-page"
import { TrashPageItem, trashPageVariants } from "./trash-page"
import { PublicLinkItem, publicLinkVariants } from "./public-link"
import { ShareDialogItem, shareDialogVariants } from "./share-dialog"
import { MoveDialogItem, moveDialogVariants } from "./move-dialog"
import { VersionHistoryItem, versionHistoryVariants } from "./version-history"
import { VaultUnlockItem, vaultUnlockVariants } from "./vault-unlock"

export interface PlaygroundVariant {
  key: string
  name: string
}

export interface PlaygroundItem {
  slug: string
  title: string
  group: string
  /** 모달처럼 화면 가운데 어두운 배경 위에 띄울지 */
  stage: "modal" | "page"
  variants: PlaygroundVariant[]
  Component: ComponentType<{ variant: string }>
}

/** 새 항목은 _items/<slug>/ 에 만들고 여기에 한 줄 추가한다. */
export const PLAYGROUND_ITEMS: PlaygroundItem[] = [
  {
    slug: "files-page",
    title: "파일 메인",
    group: "페이지",
    stage: "page",
    variants: filesPageVariants,
    Component: FilesPageItem,
  },
  {
    slug: "file-preview",
    title: "미리보기",
    group: "페이지",
    stage: "page",
    variants: filePreviewVariants,
    Component: FilePreviewItem,
  },
  {
    slug: "upload",
    title: "업로드",
    group: "페이지",
    stage: "page",
    variants: uploadVariants,
    Component: UploadItem,
  },
  {
    slug: "activity-page",
    title: "활동",
    group: "페이지",
    stage: "page",
    variants: activityPageVariants,
    Component: ActivityPageItem,
  },
  {
    slug: "trash-page",
    title: "휴지통",
    group: "페이지",
    stage: "page",
    variants: trashPageVariants,
    Component: TrashPageItem,
  },
  {
    slug: "public-link",
    title: "공유 링크 열람",
    group: "페이지",
    stage: "page",
    variants: publicLinkVariants,
    Component: PublicLinkItem,
  },
  {
    slug: "share-dialog",
    title: "공유",
    group: "모달",
    stage: "modal",
    variants: shareDialogVariants,
    Component: ShareDialogItem,
  },
  {
    slug: "move-dialog",
    title: "이동",
    group: "모달",
    stage: "modal",
    variants: moveDialogVariants,
    Component: MoveDialogItem,
  },
  {
    slug: "version-history",
    title: "버전 기록",
    group: "모달",
    stage: "modal",
    variants: versionHistoryVariants,
    Component: VersionHistoryItem,
  },
  {
    slug: "vault-unlock",
    title: "보안 폴더 잠금 해제",
    group: "모달",
    stage: "modal",
    variants: vaultUnlockVariants,
    Component: VaultUnlockItem,
  },
]

export function findPlaygroundItem(slug: string) {
  return PLAYGROUND_ITEMS.find((i) => i.slug === slug)
}
