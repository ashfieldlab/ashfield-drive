/**
 * 백엔드 API 응답 타입: Pydantic 스키마와 1:1 매핑.
 *
 * Phase 1a에 NodeResponse 추가.
 */

export interface MeResponse {
  sub: string
  email: string
  name: string | null
  groups: string[]
  roles: string[]
  is_system_admin: boolean
}

// --- Phase 1a: Nodes ---

export type NodeKind = "file" | "folder"
export type NodeScope = "personal" | "shared"
export type NodeStatus = "pending" | "ready"

export interface NodeResponse {
  id: string
  kind: NodeKind
  name: string
  parent_id: string | null
  company_id: string
  owner_id: string
  scope: NodeScope
  size_bytes: number | null
  mime: string | null
  status: NodeStatus
  // E2E vault 파일의 wrapped DEK (ADR-0016). vault 밖 파일은 null/없음.
  wrapped_dek?: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface TreeResponse {
  nodes: NodeResponse[]
}

export interface AncestorItem {
  id: string
  name: string
  kind: "file" | "folder"
}

export interface AncestorsResponse {
  ancestors: AncestorItem[]
}

export interface UploadUrlResponse {
  node_id: string
  upload_url: string | null
  multipart: boolean
  upload_id: string | null
  part_size: number | null
  expires_in: number
}

export interface PartUrlResponse {
  url: string
  expires_in: number
}

export interface DownloadUrlResponse {
  url: string
  expires_in: number
}

// --- Phase 1.5a: FileShare ---

export type SharePermission = "read" | "write" | "manage"

export interface FileShareResponse {
  id: string
  node_id: string
  grantee_sub: string
  grantee_email: string | null
  grantee_name: string | null
  permission: SharePermission
  granted_by_sub: string
  granted_at: string
  expires_at: string | null
}

export interface FileShareList {
  shares: FileShareResponse[]
}

// --- Phase 1.5b: ExternalLink ---

export type ExternalPermission = "read" | "write"

export interface ExternalLinkResponse {
  id: string
  node_id: string
  token: string
  permission: ExternalPermission
  expires_at: string | null
  has_password: boolean
  access_count: number
  last_accessed_at: string | null
  created_at: string
  revoked_at: string | null
}

export interface ExternalLinkList {
  links: ExternalLinkResponse[]
}

// --- Phase 3a: Notifications ---

export interface NotificationResponse {
  id: string
  type: string
  actor_sub: string | null
  actor_name: string | null
  entity_type: string
  entity_id: string
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export interface NotificationListResponse {
  notifications: NotificationResponse[]
  unread_count: number
  has_more?: boolean
}

export interface EmailPreferenceResponse {
  email_enabled: boolean
  // 카테고리별 이메일 on/off. 키 없으면 on(기본). 카테고리: file_share
  email_categories: Record<string, boolean>
}

// --- Phase 4: company members ---

export interface CompanyMember {
  sub: string
  email: string
  name: string | null
}

export interface CompanyMembersResponse {
  members: CompanyMember[]
}

// 그룹 공유 / 부서 폴더 (docs/group-sharing.html)
export interface GroupDept {
  department_id: string
  department: string
  parent: string | null
  company: string
  company_name: string
  is_group: number
  member_count: number
}

export interface TeamFolderItem {
  node_id: string
  name: string
  department_id: string
  department_name: string | null
  created_by: string
  created_at: string
}

// 파일 버전 (ADR-0022): 최신순. saved_* = 그 내용을 저장했던 사람·시각.
export interface FileVersionResponse {
  id: string
  size_bytes: number
  saved_by: string
  saved_by_name: string | null
  saved_at: string
  created_at: string
}

export interface FileVersionDownloadUrl {
  url: string
  expires_in: number
  // 보안 폴더 파일이면 이 버전을 푸는 wrapped DEK
  wrapped_dek: string | null
}
