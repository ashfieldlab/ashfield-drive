/**
 * In-repo ESLint plugin: 프로젝트 전용 커스텀 룰 모음.
 *
 * 사용: eslint.config.mjs에서
 *   import localRules from "./eslint-rules/index.mjs"
 *   plugins: { local: localRules }
 *   rules: { "local/require-data-testid": "warn" }
 */

import requireDataTestid from "./require-data-testid.mjs"

export default {
  rules: {
    "require-data-testid": requireDataTestid,
  },
}
