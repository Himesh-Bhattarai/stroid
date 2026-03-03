import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CopyInstall } from "./copy-install"
import { highlight } from "@/lib/highlight"

const heroCode = `import { createStore, setStore, useStore } from 'stroid'

// Declare once
createStore('counter', { count: 0 })

// Update anywhere
export const increment = () => setStore('counter', (d) => { d.count += 1 })

// Read in React
export function Counter() {
  const count = useStore('counter', (s) => s.count)
  return <button onClick={increment}>Count: {count}</button>
}`

export async function HeroSection() {
  const html = await highlight(heroCode, 'typescript')

  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[800px] opacity-20 blur-[120px]"
        style={{ background: "radial-gradient(ellipse, oklch(0.65 0.2 145), transparent 70%)" }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-6 pb-24 pt-20 md:pb-32 md:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="outline" className="mb-6 border-primary/30 bg-primary/5 text-primary">
            v1.0 Released
          </Badge>

          <h1 className="text-balance text-4xl font-bold leading-[1.1] tracking-tight text-foreground md:text-6xl lg:text-7xl">
            The TypeScript State <span className="text-primary">Engine</span> for React
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground md:text-xl">
            Simple. Typed. Powerful. State management with built-in persistence, tab sync, and DevTools — designed for teams that ship.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/docs/quick-start" className="gap-2">
                Get Started
                <ArrowRight className="size-4" />
              </Link>
            </Button>

            <CopyInstall />
          </div>

          <p className="mt-8 text-sm text-muted-foreground/60">
            TypeScript-first · ~8.6 kB min+gzip · Zero dependencies
          </p>
        </div>

        <div className="mx-auto mt-16 max-w-2xl">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <div className="flex gap-1.5">
                <div className="size-3 rounded-full bg-muted-foreground/20" />
                <div className="size-3 rounded-full bg-muted-foreground/20" />
                <div className="size-3 rounded-full bg-muted-foreground/20" />
              </div>
              <span className="ml-2 text-xs text-muted-foreground/60">counter.tsx</span>
            </div>

            <div className="overflow-x-auto p-5">
              <div className="shiki font-mono text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
