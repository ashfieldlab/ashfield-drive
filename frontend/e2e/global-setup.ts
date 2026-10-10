/**
 * E2E 전제 점검: 계정 서버가 떠 있는지 먼저 확인해 원인이 분명한 메시지로 실패한다.
 * (앱 dev 서버는 playwright webServer 가 띄운다.)
 */
import { ACCOUNT_URL } from "./env"

export default async function globalSetup(): Promise<void> {
  // 외부(계정 서버) 호출: 디스커버리 문서.
  const res = await fetch(`${ACCOUNT_URL}/.well-known/openid-configuration`).catch(() => null)
  if (!res?.ok) {
    throw new Error(
      `Ashfield 계정 서버(${ACCOUNT_URL})에 연결할 수 없습니다. ashfield-account 에서 ` +
        "`make infra migrate seed && make dev` (AUTH_DEV_PASSWORD_LOGIN=true) 를 먼저 실행하세요.",
    )
  }
}
