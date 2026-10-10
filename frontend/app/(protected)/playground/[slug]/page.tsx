"use client"

import { use } from "react"
import { notFound } from "next/navigation"

import { cn } from "@/lib/utils"

import { PrototypeSwitcher, usePrototypeVariant } from "../_components/variant-switcher"
import { findPlaygroundItem } from "../_items/registry"

export default function PlaygroundItemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const item = findPlaygroundItem(slug)
  if (!item) notFound()
  return <Stage item={item} />
}

function Stage({ item }: { item: NonNullable<ReturnType<typeof findPlaygroundItem>> }) {
  const variant = usePrototypeVariant(item.variants)
  const { Component } = item

  return (
    <div
      className={cn(
        "absolute inset-0 overflow-auto",
        item.stage === "modal" ? "grid place-items-center bg-black/40 p-8 pb-24" : "p-6 pb-24",
      )}
      data-testid={`playground-stage-${item.slug}`}
    >
      <Component variant={variant} />
      <PrototypeSwitcher variants={item.variants} />
    </div>
  )
}
