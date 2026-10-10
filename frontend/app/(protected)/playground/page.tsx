import { redirect } from "next/navigation"

import { PLAYGROUND_ITEMS } from "./_items/registry"

export default function PlaygroundIndex() {
  const first = PLAYGROUND_ITEMS[0]
  if (first) redirect(`/playground/${first.slug}`)
  return <p className="p-8 text-sm text-muted-foreground">항목이 없습니다.</p>
}
