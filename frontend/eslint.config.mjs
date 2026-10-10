import js from "@eslint/js"
import tseslint from "typescript-eslint"
import react from "eslint-plugin-react"
import reactHooks from "eslint-plugin-react-hooks"
import nextPlugin from "@next/eslint-plugin-next"

import localRules from "./eslint-rules/index.mjs"

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "storybook-static/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,mjs,js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        process: "readonly",
        Buffer: "readonly",
        console: "readonly",
        FormData: "readonly",
        Response: "readonly",
        Request: "readonly",
        Headers: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        document: "readonly",
        window: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        atob: "readonly",
        btoa: "readonly",
        URLSearchParams: "readonly",
        URL: "readonly",
        AbortController: "readonly",
        confirm: "readonly",
        alert: "readonly",
        HeadersInit: "readonly",
        RequestInit: "readonly",
        React: "readonly",
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
      "local": localRules,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      // 신규 React 19 룰들: 일부 정상 패턴에 false positive 빈번. 필요 시 개별 활성화.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "local/require-data-testid": "warn",
    },
    settings: {
      react: { version: "detect" },
    },
  },
  // 테스트와 스토리는 testid 룰 끔 + Playwright의 `use`는 React hook 아님
  {
    files: ["**/*.stories.{ts,tsx}", "e2e/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: {
      "local/require-data-testid": "off",
      "react-hooks/rules-of-hooks": "off",
    },
  },
  // shadcn/ui 프리미티브(components/ui): 범용 부품이라 testid 는 호출부에서 넘긴다
  {
    files: ["components/ui/**/*.{ts,tsx}"],
    rules: {
      "local/require-data-testid": "off",
    },
  },
)
