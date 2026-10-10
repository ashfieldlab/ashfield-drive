/**
 * ESLint custom rule — interactive 요소에 data-testid 강제.
 *
 * SPEC §2.9 + frontend/CLAUDE.md "테스트 선택자".
 *
 * 검출 대상:
 *   - <button>, <Button>
 *   - <input>, <select>, <textarea>
 *   - <a href> (탐색용 링크), <Link>
 *
 * 누락 시 warning. decorative 요소는 룰 직접 알 수 없으므로
 * 의식적으로 빠뜨려야 할 때 // eslint-disable-next-line require-data-testid 사용.
 */

const TARGET_TAGS = new Set([
  "button",
  "Button",
  "input",
  "select",
  "textarea",
  "Link",
])

function hasAnchorWithHref(node) {
  if (node.name?.name !== "a") return false
  return node.attributes.some(
    (attr) =>
      attr.type === "JSXAttribute" && attr.name?.name === "href",
  )
}

function hasDataTestId(node) {
  return node.attributes.some((attr) => {
    if (attr.type !== "JSXAttribute") return false
    const name = attr.name
    if (name?.type === "JSXIdentifier" && name.name === "data-testid") return true
    if (
      name?.type === "JSXNamespacedName" &&
      name.namespace?.name === "data" &&
      name.name?.name === "testid"
    )
      return true
    return false
  })
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Interactive 요소에 data-testid 부여를 강제 (e2e 테스트 selector 안정성).",
    },
    schema: [],
    messages: {
      missing:
        "Interactive 요소 <{{tag}}>에 data-testid가 없습니다. e2e 테스트가 깨질 수 있음 — {feature}-{element}[-{action|id}] 형식으로 추가하세요.",
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const tag = node.name?.name
        const isTarget = TARGET_TAGS.has(tag) || hasAnchorWithHref(node)
        if (!isTarget) return
        if (hasDataTestId(node)) return
        context.report({
          node,
          messageId: "missing",
          data: { tag },
        })
      },
    }
  },
}
