import { redirect } from "next/navigation"

import { APP } from "@/lib/apps"

export default function RootPage() {
  redirect(APP.home)
}
