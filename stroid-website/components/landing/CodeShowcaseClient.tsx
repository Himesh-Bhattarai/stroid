"use client"

import { useCodeShowcase } from "@/app/sidebar-context"
import { cn } from "@/lib/utils"

export interface ShowcaseTab {
  id: string
  label: string
  filename: string
  code: string
  html: string
}

export function CodeShowcaseClient({ tabs }: { tabs: ShowcaseTab[] }) {
  const { tab: activeTab, setTab } = useCodeShowcase()
  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0]

  return (
    <section className="border-t border-border bg-card/30">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            See it in action
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            From basic stores to async flows, persistence, and form binding — all with the same clean API.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-3xl">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center gap-0 overflow-x-auto border-b border-border bg-muted/30">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setTab(tab.id)}
                  className={cn(
                    'whitespace-nowrap border-b-2 px-5 py-3 text-sm font-medium transition-colors',
                    activeTab === tab.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center border-b border-border/50 bg-muted/20 px-4 py-2">
              <span className="font-mono text-xs text-muted-foreground/60">{active.filename}</span>
            </div>

            <div className="w-full max-w-full overflow-x-auto p-5">
              <div className="shiki font-mono text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: active.html }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
