import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import { ErrorPage } from "./error-page"

const meta: Meta<typeof ErrorPage> = {
  title: "ui-custom/ErrorPage",
  component: ErrorPage,
  argTypes: {
    type: {
      control: "select",
      options: [
        "unknown-error",
        "404",
        "no-permission",
        "network",
        "session-expired",
      ],
    },
  },
}
export default meta

type Story = StoryObj<typeof ErrorPage>

export const UnknownError: Story = { args: { type: "unknown-error" } }
export const NotFound: Story = { args: { type: "404" } }
export const NoPermission: Story = { args: { type: "no-permission" } }
export const Network: Story = { args: { type: "network" } }
export const SessionExpired: Story = { args: { type: "session-expired" } }

export const WithRetry: Story = {
  args: {
    type: "unknown-error",
    onClickPrimary: () => alert("retry clicked"),
  },
}
