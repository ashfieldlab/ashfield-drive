/**
 * Dev 테스트 사용자 픽스처 — 서버·클라이언트 양쪽에서 import 안전.
 *
 * 실제 JWT 서명은 server-only인 lib/dev-jwt.ts가 담당.
 * 이 파일은 사용자 목록 렌더용 데이터만 노출.
 *
 * 시나리오:
 *   - 회사(group)는 외부 시스템이 관리. 우리는 JWT.groups 그대로 신뢰.
 *   - 4명 → admin / 회사A 멤버 / 회사B 멤버 / 양사 멤버
 *   - 빈 groups 사용자도 추가 (NoAccessPage 검증용)
 */

export interface DevUser {
  id: string
  email: string
  name: string
  companies: string[]
  roles: string[]
}

export const DEV_USERS: Record<string, DevUser> = {
  admin: {
    id: "dev-admin",
    email: "admin@dev.local",
    name: "관리자",
    companies: ["tenant-a", "tenant-b"],
    roles: ["admin"],
  },
  member_a: {
    id: "dev-member-a",
    email: "member-a@dev.local",
    name: "Tenant A 멤버",
    companies: ["tenant-a"],
    roles: [],
  },
  member_b: {
    id: "dev-member-b",
    email: "member-b@dev.local",
    name: "Tenant B 멤버",
    companies: ["tenant-b"],
    roles: [],
  },
  multi: {
    id: "dev-multi",
    email: "multi@dev.local",
    name: "양사 멤버",
    companies: ["tenant-a", "tenant-b"],
    roles: [],
  },
  // 빈 groups — 접근 차단 화면 검증용 (Phase 1e)
  no_company: {
    id: "dev-no-company",
    email: "no-company@dev.local",
    name: "회사 미배정",
    companies: [],
    roles: [],
  },
}
