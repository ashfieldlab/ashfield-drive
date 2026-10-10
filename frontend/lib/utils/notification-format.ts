/**
 * 알림 타입별 사용자 친화 문장 + 링크.
 *
 * 백엔드 payload 의 raw 필드를 받아 "관리자가 'LICENSE.txt'을(를) 공유했습니다" 같은
 * 한 줄 카피로 변환. 모르는 type 은 fallback.
 */

import type { NotificationResponse } from "@/lib/types/api"

interface RenderedNotification {
  /** 한 줄 제목: 무엇이 일어났는지. */
  title: string
  /** 한 줄 부연: 대상의 이름·시간·세부. 없으면 빈 문자열. */
  subtitle: string
  /** 클릭 시 이동할 URL. */
  href: string
}

const PERMISSION_LABEL: Record<string, string> = {
  read: "읽기",
  write: "쓰기",
  manage: "관리",
}

function actor(n: NotificationResponse): string {
  return n.actor_name || n.actor_sub || "시스템"
}

export function renderNotification(
  n: NotificationResponse,
): RenderedNotification {
  const p = n.payload as Record<string, string | number | undefined>
  const who = actor(n)

  switch (n.type) {
    case "node_shared": {
      const name = (p.node_name as string) || "파일"
      const perm = PERMISSION_LABEL[String(p.permission ?? "")] ?? "읽기"
      return {
        title: `${who}님이 공유했습니다`,
        subtitle: `${name} · ${perm} 권한`,
        href: "/files?view=shared-with-me",
      }
    }
    case "node_unshared": {
      const name = (p.node_name as string) || "파일"
      return {
        title: `${who}님이 공유를 해제했습니다`,
        subtitle: name,
        href: "/files?view=shared-with-me",
      }
    }
    case "external_link_expiring": {
      const name = (p.node_name as string) || "공유 링크"
      return {
        title: "외부 공유 링크 만료 임박",
        subtitle: name,
        href: "/files",
      }
    }
    default:
      return {
        title: n.type,
        subtitle: JSON.stringify(p).slice(0, 80),
        href: "/files",
      }
  }
}
