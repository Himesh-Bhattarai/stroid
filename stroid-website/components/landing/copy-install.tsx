"use client"

import { Copy, Check } from "lucide-react"
import { useHeroCopy } from "@/app/sidebar-context"

export function CopyInstall() {
  const { copied, setCopied } = useHeroCopy()

  const handleCopy = () => {
    navigator.clipboard.writeText("npm install stroid")
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="group flex h-10 items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 font-mono text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-muted"
      aria-label="Copy install command"
    >
      <span className="text-muted-foreground/60">$</span>
      <span>npm install stroid</span>
      {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5 opacity-40 transition-opacity group-hover:opacity-100" />}
    </button>
  )
}
