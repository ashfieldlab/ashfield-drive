import { describe, expect, it } from "vitest"

import { createSingleFlight, expiresWithin } from "./token-refresh"

describe("expiresWithin", () => {
  const now = Date.parse("2026-10-10T00:00:00Z")

  it("만료 임박이면 true, 여유가 있으면 false", () => {
    expect(expiresWithin(new Date(now + 30_000), 60_000, now)).toBe(true)
    expect(expiresWithin(new Date(now + 5 * 60_000), 60_000, now)).toBe(false)
  })

  it("이미 만료됐으면 true", () => {
    expect(expiresWithin(new Date(now - 1_000), 60_000, now)).toBe(true)
  })

  it("문자열 시각도 받는다", () => {
    expect(expiresWithin(new Date(now + 10_000).toISOString(), 60_000, now)).toBe(true)
  })

  it("만료 시각을 모르면 갱신하지 않는다", () => {
    expect(expiresWithin(null, 60_000, now)).toBe(false)
    expect(expiresWithin(undefined, 60_000, now)).toBe(false)
    expect(expiresWithin("not-a-date", 60_000, now)).toBe(false)
  })
})

describe("createSingleFlight", () => {
  it("같은 키의 동시 호출은 작업을 한 번만 돌리고 결과를 공유한다", async () => {
    const run = createSingleFlight<string>()
    let calls = 0
    let release!: (v: string) => void
    const task = () => {
      calls++
      return new Promise<string>((r) => (release = r))
    }
    const a = run("acc-1", task)
    const b = run("acc-1", task)
    release("token-1")
    expect(await Promise.all([a, b])).toEqual(["token-1", "token-1"])
    expect(calls).toBe(1)
  })

  it("다른 키는 따로 돈다", async () => {
    const run = createSingleFlight<string>()
    let calls = 0
    const task = async () => `t${++calls}`
    expect(await Promise.all([run("a", task), run("b", task)])).toEqual(["t1", "t2"])
  })

  it("끝난 뒤엔 새로 돈다 (실패해도 비운다)", async () => {
    const run = createSingleFlight<string>()
    await expect(run("k", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom")
    expect(await run("k", async () => "ok")).toBe("ok")
  })
})
