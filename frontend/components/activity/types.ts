/** /api/v1/me/activity 응답 (backend/app/api/v1/activity.py) */

export interface ActivityNode {
  id: string
  /** 보안 폴더 항목이면 null */
  name: string | null
  kind: "file" | "folder"
  mime: string | null
  scope: "personal" | "shared"
  parent_id: string | null
  /** 루트이거나 내가 볼 수 없는 폴더면 null */
  parent_name: string | null
  deleted: boolean
}

export interface ActivityItem {
  id: string
  actor_sub: string | null
  actor_name: string | null
  actor_image?: string | null
  action: string
  entity_type: string
  entity_id: string
  meta: Record<string, unknown>
  created_at: string
  /** 영구 삭제됐으면 null */
  node?: ActivityNode | null
  grantee_name?: string | null
  old_parent_name?: string | null
  new_parent_name?: string | null
  /** 생성(업로드) 당시 폴더 이름 (meta.parent_id 기준). 루트이거나 볼 수 없는 폴더면 null */
  created_in_name?: string | null
}

export interface ActivityResponse {
  items: ActivityItem[]
}
