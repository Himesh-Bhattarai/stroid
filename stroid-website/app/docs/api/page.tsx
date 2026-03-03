import Link from "next/link"
import { DocsH1, DocsParagraph } from "@/components/docs/docs-content"

const apis = [
  {
    name: "createStore",
    description: "Creates a new store instance with state, actions, and computed values.",
    href: "/docs/api/create-store",
  },
  {
    name: "useStore",
    description: "React hook to subscribe a component to a store with a selector.",
    href: "/docs/api/use-store",
  },
  {
    name: "setStore",
    description: "Imperatively update a store's state from outside actions.",
    href: "/docs/api/set-store",
  },
  {
    name: "useFormStore",
    description: "Specialized hook for form state with validation, dirty tracking, and submission.",
    href: "/docs/api/use-form-store",
  },
  {
    name: "createStoreForRequest",
    description: "Create an isolated store instance for SSR / request-scoped state.",
    href: "/docs/api/create-store-for-request",
  },
  {
    name: "StoreOptions",
    description: "Configuration options for persistence, sync, and DevTools.",
    href: "/docs/api/store-options",
  },
]

export const metadata = {
  title: "API Reference - stroid Docs",
  description: "Complete API reference for the stroid state management library.",
}

export default function APIReferencePage() {
  return (
    <article>
      <DocsH1>API Reference</DocsH1>
      <DocsParagraph>
        Complete reference for every exported function, hook, and type in stroid. Each entry includes
        the TypeScript signature, parameters, return values, and runnable examples.
      </DocsParagraph>

      <div className="mt-8 grid gap-3">
        {apis.map((api) => (
          <Link
            key={api.name}
            href={api.href}
            className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/20 hover:bg-card/80"
          >
            <h3 className="font-mono text-base font-semibold text-foreground group-hover:text-primary">
              {api.name}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{api.description}</p>
          </Link>
        ))}
      </div>
    </article>
  )
}
