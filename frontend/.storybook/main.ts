import type { StorybookConfig } from "@storybook/nextjs-vite"

const config: StorybookConfig = {
  // 컴포넌트 옆에 *.stories.tsx 두는 패턴
  stories: ["../components/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
  ],
  framework: "@storybook/nextjs-vite",
  staticDirs: ["../public"],
}
export default config
