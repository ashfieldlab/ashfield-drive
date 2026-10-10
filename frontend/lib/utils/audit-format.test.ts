import { describe, expect, it } from "vitest"

import { dayBucket, fileKind, josaEul, josaGwa, josaRo } from "./audit-format"

describe("조사", () => {
  it("을/를", () => {
    expect(josaEul("디자인")).toBe("을")
    expect(josaEul("로고 최종.svg")).toBe("를")
    expect(josaEul("보고서")).toBe("를")
    expect(josaEul("file.pdf")).toBe("를")
    expect(josaEul("notes.html")).toBe("을")
  })
  it("으로/로 (ㄹ 받침은 로)", () => {
    expect(josaRo("보관함")).toBe("으로")
    expect(josaRo("서울")).toBe("로")
    expect(josaRo("디자인 팀")).toBe("으로")
    expect(josaRo("내 파일")).toBe("로")
  })
  it("과/와", () => {
    expect(josaGwa("김하늘님")).toBe("과")
    expect(josaGwa("디자인팀")).toBe("과")
    expect(josaGwa("개발부")).toBe("와")
  })
})

describe("dayBucket", () => {
  const now = new Date("2026-10-10T17:00:00")
  it("오늘, 어제, 이번 주, 이전", () => {
    expect(dayBucket(new Date("2026-10-10T08:00:00").toISOString(), now)).toBe("오늘")
    expect(dayBucket(new Date("2026-10-09T23:00:00").toISOString(), now)).toBe("어제")
    expect(dayBucket(new Date("2026-10-05T10:00:00").toISOString(), now)).toBe("이번 주")
    expect(dayBucket(new Date("2026-09-01T10:00:00").toISOString(), now)).toBe("이전")
  })
})

describe("fileKind", () => {
  it("확장자, MIME, 폴더", () => {
    expect(fileKind("a.PNG", null)).toBe("image")
    expect(fileKind("deck.pptx", null)).toBe("slide")
    expect(fileKind("noext", "video/mp4")).toBe("video")
    expect(fileKind("x", null, true)).toBe("folder")
    expect(fileKind("x", null)).toBe("text")
  })
})
