// 플레이그라운드 전용 가짜 데이터. 화면 모양을 비교하려는 것이라 서버를 부르지 않는다.

export type MockKind = "folder" | "image" | "pdf" | "doc" | "sheet" | "slide" | "video" | "audio" | "archive" | "code" | "text"

export interface MockNode {
  id: string
  name: string
  kind: MockKind
  parentId: string | null
  /** 바이트. 폴더는 하위 합계 */
  size: number
  /** 폴더 안 항목 수 */
  count?: number
  updatedAt: string
  owner: string
  /** 공유 중인 사람 수 (0 이면 비공개) */
  sharedWith: number
  hasLink?: boolean
  starred?: boolean
  vault?: boolean
  /** 이미지 미리보기 대신 쓰는 CSS 배경 (외부 이미지 없이) */
  thumb?: string
}

export interface MockMember {
  id: string
  name: string
  email: string
  color: string
}

export const ME: MockMember = { id: "u1", name: "Proto", email: "proto7@example.com", color: "#4f6b4a" }

export const MEMBERS: MockMember[] = [
  ME,
  { id: "u2", name: "김하늘", email: "sky@example.com", color: "#2563eb" },
  { id: "u3", name: "이서준", email: "seojun@example.com", color: "#d97706" },
  { id: "u4", name: "박지민", email: "jimin@example.com", color: "#db2777" },
  { id: "u5", name: "최도윤", email: "doyun@example.com", color: "#7c3aed" },
  { id: "u6", name: "정유나", email: "yuna@example.com", color: "#0d9488" },
]

const d = (daysAgo: number, h = 10) => {
  const t = new Date("2026-10-10T00:00:00+09:00")
  t.setDate(t.getDate() - daysAgo)
  t.setHours(h, (daysAgo * 17) % 60)
  return t.toISOString()
}

export const NODES: MockNode[] = [
  { id: "f-design", name: "디자인", kind: "folder", parentId: null, size: 184_320_000, count: 24, updatedAt: d(0, 15), owner: "u1", sharedWith: 3, starred: true },
  { id: "f-contracts", name: "계약서", kind: "folder", parentId: null, size: 12_400_000, count: 8, updatedAt: d(2), owner: "u1", sharedWith: 0, vault: true },
  { id: "f-photos", name: "2026 워크숍 사진", kind: "folder", parentId: null, size: 912_000_000, count: 186, updatedAt: d(5), owner: "u1", sharedWith: 5, hasLink: true },
  { id: "f-meeting", name: "회의록", kind: "folder", parentId: null, size: 2_300_000, count: 41, updatedAt: d(1, 18), owner: "u1", sharedWith: 2 },
  { id: "f-archive", name: "보관", kind: "folder", parentId: null, size: 3_100_000_000, count: 512, updatedAt: d(60), owner: "u1", sharedWith: 0 },
  { id: "n-plan", name: "2027 사업계획.docx", kind: "doc", parentId: null, size: 482_000, updatedAt: d(0, 11), owner: "u1", sharedWith: 2, starred: true },
  { id: "n-budget", name: "4분기 예산.xlsx", kind: "sheet", parentId: null, size: 96_400, updatedAt: d(0, 9), owner: "u3", sharedWith: 4 },
  { id: "n-deck", name: "투자 제안서 v3.pptx", kind: "slide", parentId: null, size: 18_700_000, updatedAt: d(1, 14), owner: "u1", sharedWith: 1, hasLink: true },
  { id: "n-cover", name: "표지 시안.png", kind: "image", parentId: null, size: 3_400_000, updatedAt: d(3), owner: "u2", sharedWith: 0, thumb: "linear-gradient(135deg, #f4c58b 0%, #d9825b 45%, #5b3a5e 100%)" },
  { id: "n-office", name: "사무실 전경.jpg", kind: "image", parentId: null, size: 5_100_000, updatedAt: d(4), owner: "u1", sharedWith: 0, thumb: "linear-gradient(160deg, #cfe3e8 0%, #8fb3ba 50%, #3d5a63 100%)" },
  { id: "n-guide", name: "브랜드 가이드.pdf", kind: "pdf", parentId: null, size: 24_800_000, updatedAt: d(6), owner: "u4", sharedWith: 6 },
  { id: "n-demo", name: "제품 데모.mp4", kind: "video", parentId: null, size: 412_000_000, updatedAt: d(8), owner: "u1", sharedWith: 0 },
  { id: "n-call", name: "고객 인터뷰 녹음.m4a", kind: "audio", parentId: null, size: 38_200_000, updatedAt: d(12), owner: "u5", sharedWith: 1 },
  { id: "n-src", name: "landing-page.zip", kind: "archive", parentId: null, size: 7_900_000, updatedAt: d(20), owner: "u1", sharedWith: 0 },
  { id: "n-script", name: "deploy.sh", kind: "code", parentId: null, size: 2_140, updatedAt: d(30), owner: "u1", sharedWith: 0 },
  { id: "n-memo", name: "메모.txt", kind: "text", parentId: null, size: 860, updatedAt: d(45), owner: "u1", sharedWith: 0 },
  // 디자인 폴더 안
  { id: "n-logo", name: "로고 최종.svg", kind: "image", parentId: "f-design", size: 24_000, updatedAt: d(0, 15), owner: "u2", sharedWith: 3, thumb: "radial-gradient(circle at 50% 45%, #3f4a3c 0 22%, #e9ece4 23% 100%)" },
  { id: "n-ui", name: "앱 화면 시안.fig", kind: "doc", parentId: "f-design", size: 64_000_000, updatedAt: d(1), owner: "u1", sharedWith: 3 },
  { id: "n-pal", name: "컬러 팔레트.png", kind: "image", parentId: "f-design", size: 1_200_000, updatedAt: d(2), owner: "u2", sharedWith: 3, thumb: "linear-gradient(90deg, #3f4a3c 0 20%, #8a9a6b 20% 40%, #d8cfae 40% 60%, #c27c4e 60% 80%, #2f3b4a 80% 100%)" },
]

/** 휴지통 */
export const TRASH: (MockNode & { deletedAt: string; originalPath: string })[] = [
  { id: "t1", name: "옛 로고.ai", kind: "image", parentId: null, size: 8_200_000, updatedAt: d(40), owner: "u1", sharedWith: 0, deletedAt: d(1), originalPath: "내 파일 / 디자인" },
  { id: "t2", name: "임시 폴더", kind: "folder", parentId: null, size: 54_000_000, count: 12, updatedAt: d(25), owner: "u1", sharedWith: 0, deletedAt: d(3), originalPath: "내 파일" },
  { id: "t3", name: "3분기 예산 초안.xlsx", kind: "sheet", parentId: null, size: 88_000, updatedAt: d(70), owner: "u1", sharedWith: 0, deletedAt: d(9), originalPath: "내 파일 / 보관" },
  { id: "t4", name: "screen-recording.mov", kind: "video", parentId: null, size: 220_000_000, updatedAt: d(26), owner: "u1", sharedWith: 0, deletedAt: d(22), originalPath: "내 파일" },
]

export interface MockShare {
  member: MockMember
  permission: "read" | "write" | "manage"
}

export const SHARES: MockShare[] = [
  { member: MEMBERS[1], permission: "write" },
  { member: MEMBERS[2], permission: "read" },
  { member: MEMBERS[3], permission: "manage" },
]

export const LINK = {
  url: "https://drive.ashfield.dev/s/k3Fq9xLm2Pa",
  permission: "read" as "read" | "write",
  expiresAt: d(-7),
  hasPassword: true,
  downloads: 14,
}

export interface MockVersion {
  id: string
  size: number
  savedBy: MockMember
  savedAt: string
  current?: boolean
}

export const VERSIONS: MockVersion[] = [
  { id: "v6", size: 482_000, savedBy: MEMBERS[0], savedAt: d(0, 11), current: true },
  { id: "v5", size: 476_100, savedBy: MEMBERS[2], savedAt: d(0, 9) },
  { id: "v4", size: 470_900, savedBy: MEMBERS[0], savedAt: d(1, 17) },
  { id: "v3", size: 401_000, savedBy: MEMBERS[1], savedAt: d(3, 13) },
  { id: "v2", size: 220_300, savedBy: MEMBERS[0], savedAt: d(7) },
  { id: "v1", size: 98_000, savedBy: MEMBERS[0], savedAt: d(14) },
]

export type ActivityAction = "create" | "upload" | "rename" | "move" | "delete" | "restore" | "share" | "unshare" | "link" | "version"

export interface MockActivity {
  id: string
  actor: MockMember
  action: ActivityAction
  target: string
  targetKind: MockKind
  detail?: string
  at: string
}

export const ACTIVITY: MockActivity[] = [
  { id: "a1", actor: MEMBERS[0], action: "version", target: "2027 사업계획.docx", targetKind: "doc", detail: "버전 6", at: d(0, 11) },
  { id: "a2", actor: MEMBERS[2], action: "upload", target: "4분기 예산.xlsx", targetKind: "sheet", at: d(0, 9) },
  { id: "a3", actor: MEMBERS[1], action: "upload", target: "로고 최종.svg", targetKind: "image", detail: "디자인", at: d(0, 8) },
  { id: "a4", actor: MEMBERS[0], action: "share", target: "디자인", targetKind: "folder", detail: "김하늘, 이서준, 박지민", at: d(1, 16) },
  { id: "a5", actor: MEMBERS[0], action: "link", target: "투자 제안서 v3.pptx", targetKind: "slide", at: d(1, 14) },
  { id: "a6", actor: MEMBERS[3], action: "rename", target: "브랜드 가이드.pdf", targetKind: "pdf", detail: "brand_guide_final.pdf", at: d(2, 10) },
  { id: "a7", actor: MEMBERS[0], action: "move", target: "회의록 1007.md", targetKind: "text", detail: "회의록", at: d(3, 15) },
  { id: "a8", actor: MEMBERS[0], action: "delete", target: "옛 로고.ai", targetKind: "image", at: d(1, 12) },
  { id: "a9", actor: MEMBERS[4], action: "upload", target: "고객 인터뷰 녹음.m4a", targetKind: "audio", at: d(12) },
  { id: "a10", actor: MEMBERS[0], action: "restore", target: "메모.txt", targetKind: "text", at: d(13) },
  { id: "a11", actor: MEMBERS[0], action: "unshare", target: "보관", targetKind: "folder", detail: "정유나", at: d(20) },
]

export const QUOTA = { used: 4_720_000_000, total: 15_000_000_000 }

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ["KB", "MB", "GB", "TB"]
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

export function memberOf(id: string): MockMember {
  return MEMBERS.find((m) => m.id === id) ?? ME
}

/** "방금", "3시간 전", "어제", "10월 3일" */
export function relativeTime(iso: string): string {
  const now = new Date("2026-10-10T17:00:00+09:00").getTime()
  const diff = (now - new Date(iso).getTime()) / 1000
  if (diff < 60) return "방금"
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 172800) return "어제"
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })
}
