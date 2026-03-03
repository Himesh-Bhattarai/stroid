import { SiteHeader } from "@/components/site-header"

import { ArrowRight, ShoppingCart, CheckSquare, User, Settings, FileText, BarChart3 } from "lucide-react"

const examples = [
  {
    title: "Todo App",
    description: "Classic todo list with add, toggle, delete, and filter. Shows createStore, useStore, and selectors.",
    icon: CheckSquare,
    features: ["createStore", "useStore", "Selectors", "Computed values"],
  },
  {
    title: "Shopping Cart",
    description: "E-commerce cart with persistence and cross-tab sync. Add items, adjust quantities, see totals update in real-time.",
    icon: ShoppingCart,
    features: ["Persistence", "Tab Sync", "Computed values", "Async actions"],
  },
  {
    title: "Auth Flow",
    description: "Complete authentication pattern with login, logout, token refresh, and protected state.",
    icon: User,
    features: ["Async actions", "Persistence", "Error handling", "TypeScript"],
  },
  {
    title: "Form Builder",
    description: "Dynamic form with useFormStore — validation, dirty tracking, and async submission.",
    icon: FileText,
    features: ["useFormStore", "Validation", "Dirty tracking", "Async submit"],
  },
  {
    title: "Theme Settings",
    description: "User preferences persisted to localStorage with cross-tab sync. Change theme in one tab, see it everywhere.",
    icon: Settings,
    features: ["Persistence", "Tab Sync", "DevTools"],
  },
  {
    title: "Real-time Dashboard",
    description: "Data fetching with loading/error states, polling, and optimistic updates.",
    icon: BarChart3,
    features: ["Async actions", "Polling", "Optimistic updates", "Error handling"],
  },
]

export const metadata = {
  title: "Examples - stroid",
  description: "Real-world examples built with stroid state management.",
}

export default function ExamplesPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            Examples
          </h1>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Real-world patterns built with stroid. Each example demonstrates different features
            working together in a complete application.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3">
          {examples.map((example) => (
            <div
              key={example.title}
              className="group flex flex-col rounded-xl border border-border bg-card p-6"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <example.icon className="size-5 text-primary" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground group-hover:text-primary">
                {example.title}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {example.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {example.features.map((f) => (
                  <span
                    key={f}
                    className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {f}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm font-medium text-primary">
                Live playground coming soon
                <ArrowRight className="size-3.5" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
