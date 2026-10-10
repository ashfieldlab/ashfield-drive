import { describe, expect, it } from "vitest"

import { isEmailAllowed, parseEmailList } from "./allowlist"

describe("ALLOWED_EMAILS", () => {
  it("빈 값이면 누구나 허용", () => {
    const list = parseEmailList("")
    expect(list.size).toBe(0)
    expect(isEmailAllowed("anyone@example.com", list)).toBe(true)
    expect(isEmailAllowed(undefined, parseEmailList(undefined))).toBe(true)
  })

  it("쉼표 구분·공백·대소문자 무시", () => {
    const list = parseEmailList(" Alice@Example.com , bob@example.com,, ")
    expect([...list]).toEqual(["alice@example.com", "bob@example.com"])
    expect(isEmailAllowed("ALICE@example.COM", list)).toBe(true)
    expect(isEmailAllowed(" bob@example.com ", list)).toBe(true)
  })

  it("목록이 있으면 그 밖의 이메일·빈 이메일은 거부", () => {
    const list = parseEmailList("alice@example.com")
    expect(isEmailAllowed("mallory@example.com", list)).toBe(false)
    expect(isEmailAllowed("", list)).toBe(false)
    expect(isEmailAllowed(null, list)).toBe(false)
  })
})
