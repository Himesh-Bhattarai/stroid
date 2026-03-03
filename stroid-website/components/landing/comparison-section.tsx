import { Check } from "lucide-react"

const highlights = [
  "Named stores with selector-first hooks",
  "Built-in persistence and tab sync",
  "Zero runtime dependencies (~8.6 kB min+gzip)",
  "Redux DevTools support",
  "Mutable drafts with structural sharing",
]

export function ComparisonSection() {
  return (
    <section className="border-t border-border" id="comparison">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Choose what fits
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Stroid focuses on a small, practical core. If these highlights match your needs, great — if not, choose the tool that does.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-3xl space-y-3">
          {highlights.map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/50 px-4 py-3">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary/10"><Check className="size-4 text-primary" /></span>
              <span className="text-sm text-foreground">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
