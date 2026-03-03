import {
  Zap,
  Shield,
  RefreshCw,
  HardDrive,
  Monitor,
  Code2,
} from "lucide-react"

const features = [
  {
    icon: Zap,
    title: "Tiny & Fast",
    description:
      "~8.6 kB min+gzip with zero dependencies. Selector-based subscriptions keep renders tight.",
  },
  {
    icon: Shield,
    title: "TypeScript-First",
    description:
      "Full type inference from store definition to selectors. No generics gymnastics required.",
  },
  {
    icon: RefreshCw,
    title: "Mutable Drafts",
    description:
      "Write mutations naturally with Immer-like syntax. stroid handles immutability under the hood.",
  },
  {
    icon: HardDrive,
    title: "Built-in Persistence",
    description:
      "Persist state to localStorage, sessionStorage, or custom backends with a single config option.",
  },
  {
    icon: Monitor,
    title: "Tab Sync",
    description:
      "State synchronizes across browser tabs automatically. No extra setup. No BroadcastChannel boilerplate.",
  },
  {
    icon: Code2,
    title: "DevTools",
    description:
      "Time-travel debugging, action logging, and state inspection built in. Connect to Redux DevTools instantly.",
  },
]

export function FeaturesSection() {
  return (
    <section className="border-t border-border bg-card/30" id="features">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Everything you need. Nothing you don{"'"}t.
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            A focused API surface that covers real-world state management — persistence, sync, DevTools — without the boilerplate.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/20 hover:bg-card/80"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <feature.icon className="size-5 text-primary" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
