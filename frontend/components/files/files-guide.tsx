"use client"

import { driver } from "driver.js"
import "driver.js/dist/driver.css"
import { HelpCircle } from "lucide-react"

import { logger } from "@/lib/utils/logger"

// 내 파일 화면 사용법 투어 (driver.js). 행 액션 버튼은 id 가 동적이라 접미사
// 셀렉터로 첫 행을 잡는다. selector 가 DOM 에 없는 스텝(권한·데이터에 따라 없는
// 버튼)은 실행 직전 걸러낸다.
interface GuideStep {
  selector?: string
  title: string
  description: string
}

const STEPS: GuideStep[] = [
  {
    title: "내 파일 사용법",
    description:
      "파일 관리 기능을 순서대로 안내합니다. 언제든 ESC 키로 종료할 수 있습니다.",
  },
  {
    selector: '[data-testid="files-upload-button"]',
    title: "업로드",
    description:
      "파일을 올립니다. 폴더 업로드도 가능하며, 큰 파일은 자동으로 분할 업로드됩니다.",
  },
  {
    selector: '[data-testid$="-download"]',
    title: "다운로드",
    description:
      "파일 행의 이 버튼으로 내려받습니다. 폴더는 하나의 zip 파일로 묶여 받아집니다.",
  },
  {
    selector: '[data-testid$="-share"]',
    title: "공유",
    description:
      "이 버튼을 누르면 공유 창이 열립니다. ‘사용자’ 탭에서 워크스페이스 구성원에게 읽기·쓰기 권한을 지정해 공유하고, ‘외부 링크’ 탭에서 링크(비밀번호 설정 가능)로 공유합니다.",
  },
  {
    selector: '[data-testid$="-delete"]',
    title: "삭제",
    description:
      "삭제한 항목은 휴지통으로 이동해 나중에 복원할 수 있습니다. (보안 폴더 파일은 예외, 아래 참고)",
  },
  {
    selector: '[data-testid="nav-link-files-trash"]',
    title: "휴지통",
    description:
      "삭제한 항목은 여기 모입니다. 항목을 복원하거나, 휴지통을 비워 영구 삭제합니다.",
  },
  {
    selector:
      '[data-testid="files-vault-badge"], [data-testid="files-make-vault-button"]',
    title: "보안 폴더 (특이사항)",
    description:
      "종단간 암호화 폴더입니다. 잠긴 동안에는 내용이 보이지 않고, 비밀번호와 복구코드를 모두 잃으면 복구할 수 없습니다. 보안 폴더 안의 파일은 휴지통을 거치지 않고 즉시 영구 삭제되며, 한 번 만든 보안 폴더는 다시 일반 폴더로 전환할 수 없습니다.",
  },
]

export function FilesGuideButton() {
  function start() {
    const steps = STEPS.filter(
      (s) => !s.selector || document.querySelector(s.selector),
    ).map((s) => ({
      element: s.selector,
      popover: {
        title: s.title,
        description: s.description,
        side: "bottom" as const,
        align: "start" as const,
      },
    }))
    logger.info("files_guide_start", { category: "ui", steps: steps.length })
    driver({
      showProgress: true,
      nextBtnText: "다음",
      prevBtnText: "이전",
      doneBtnText: "완료",
      progressText: "{{current}} / {{total}}",
      steps,
    }).drive()
  }

  return (
    <button
      onClick={start}
      data-testid="files-guide-button"
      title="사용법 안내"
      className="inline-flex flex-shrink-0 items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
    >
      <HelpCircle size={14} />
      사용법
    </button>
  )
}
