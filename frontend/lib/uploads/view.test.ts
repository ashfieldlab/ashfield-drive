import { describe, expect, it } from "vitest"

import { groupByRoot } from "./drop"
import { arrangeRows, formatEta, summarize, type UploadLike } from "./view"

const up = (state: UploadLike["state"], size = 100, loaded = 0, speed = 0, id: string = state) => ({ id, state, size, loaded, speed })

describe("summarize", () => {
  it("취소는 빼고 바이트 기준 진행률과 남은 시간", () => {
    const s = summarize([up("uploading", 100, 50, 10), up("queued", 100), up("done", 100, 100), up("canceled", 1000)])
    expect(s.total).toBe(300)
    expect(s.loaded).toBe(150)
    expect(s.pct).toBe(50)
    expect(s.active).toBe(2)
    expect(s.done).toBe(1)
    expect(s.eta).toBe(15) // 남은 150 / 10
  })

  it("실패 수", () => {
    expect(summarize([up("failed"), up("failed"), up("done")]).failed).toBe(2)
  })
})

describe("arrangeRows", () => {
  const items = [
    up("queued", 1, 0, 0, "q1"),
    up("uploading", 1, 0, 0, "u1"),
    up("failed", 1, 0, 0, "f1"),
    up("queued", 1, 0, 0, "q2"),
    up("uploading", 1, 0, 0, "u2"),
    up("queued", 1, 0, 0, "q3"),
  ]

  it("실패는 위로, 업로드 중이 대기보다 먼저, 3개 넘으면 접기", () => {
    const r = arrangeRows(items, false)
    expect(r.failed.map((u) => u.id)).toEqual(["f1"])
    expect(r.shown.map((u) => u.id)).toEqual(["u1", "u2", "q1"])
    expect(r.hidden.map((u) => u.id)).toEqual(["q2", "q3"])
  })

  it("펼치면 전부", () => {
    const r = arrangeRows(items, true)
    expect(r.shown).toHaveLength(5)
    expect(r.hidden).toHaveLength(0)
  })
})

describe("formatEta", () => {
  it("초, 분, 시간", () => {
    expect(formatEta(0)).toBe("")
    expect(formatEta(12.2)).toBe("13초 남음")
    expect(formatEta(125)).toBe("3분 남음")
    expect(formatEta(3700)).toBe("1시간 2분 남음")
  })
})

describe("groupByRoot", () => {
  it("최상위 폴더별 묶음 + 낱개 파일", () => {
    const f = (name: string) => new File(["x"], name)
    const b = groupByRoot([
      { file: f("a.txt"), relPath: "a.txt" },
      { file: f("b.png"), relPath: "사진/b.png" },
      { file: f("c.png"), relPath: "사진/여행/c.png" },
      { file: f("d.md"), relPath: "문서/d.md" },
    ])
    expect(b.files.map((x) => x.name)).toEqual(["a.txt"])
    expect(b.folders.map((x) => [x.name, x.items.length])).toEqual([
      ["사진", 2],
      ["문서", 1],
    ])
  })
})
