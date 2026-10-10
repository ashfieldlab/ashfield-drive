import { authEnv } from "@/lib/env"

import CompanyMembersView from "./members-view"

/** 회사(워크스페이스) 멤버: 조회만. 멤버 관리는 Ashfield 계정 서버에서 (ADR-0024). */
export default async function CompanyMembersSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <CompanyMembersView companyId={decodeURIComponent(id)} accountURL={authEnv.accountURL} />
}
