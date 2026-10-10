// 앱 정체성 단일 소스. ashfield-drive = 파일 앱 단독 (일정은 별도 레포 ashfield-calendar).
export const APP = {
  title: "파일",
  home: "/files",
  // 활동·알림 필터용 audit entity_type (이 앱 소유 이벤트만 노출)
  entityTypes: ["node"],
} as const
