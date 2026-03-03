import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DocsH1,
  DocsParagraph,
  DocsH2,
  DocsCode,
  DocsInlineCode,
  DocsCallout,
} from "@/components/docs/docs-content"

export const metadata = {
  title: "Introduction - stroid Docs",
  description: "Learn about stroid, the TypeScript state engine for React.",
}

export default function DocsIntroPage() {
  return (
    <article>
      <div
        className="relative mb-8 overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-primary/15 via-background to-background px-6 py-8 sm:px-8"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: "url('/favicon/web-app-manifest-512x512.png')",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            backgroundSize: '220px',
          }}
        />
        <p className="text-xs uppercase tracking-[0.2em] text-primary">stroid</p>
        <h1 className="mt-2 text-3xl font-bold text-foreground sm:text-4xl">
          Reduce your code, reduce your stress — never your functionality.
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          TypeScript-first state engine with named stores, selector hooks, persistence, tab sync, async helpers, and DevTools — all built in.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/docs/quick-start">
            <Button size="sm" className="gap-2">
              Quick Start
              <ArrowRight className="size-4" />
            </Button>
          </Link>
          <Link href="/docs/why-stroid" className="text-sm text-primary underline underline-offset-4">
            Why stroid?
          </Link>
        </div>
      </div>
      <DocsH1>Introduction</DocsH1>
      <DocsParagraph>
        stroid is a TypeScript-first state management library for React. It combines the simplicity
        of selector-based hooks with built-in persistence, tab sync, async helpers, and DevTools â€”
        all with zero runtime dependencies and ~8.6 kB gzipped.
      </DocsParagraph>

      <DocsCallout type="tip">
        New to stroid? Start with the{" "}
        <Link href="/docs/quick-start" className="font-medium text-primary underline underline-offset-2">
          Quick Start
        </Link>{" "}
        guide to go from zero to a working store in 2 minutes.
      </DocsCallout>

      <section className="mt-6 grid gap-3 rounded-lg border border-border/40 bg-card/60 p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Why stroid</p>
          <p className="mt-2 text-sm text-muted-foreground">Named stores, selector-first hooks, zero deps, persistence + tab sync built-in.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-border/50 bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Bundle (min+gzip)</p>
            <p className="text-lg font-semibold text-foreground">8.6 kB</p>
          </div>
          <div className="rounded-md border border-border/50 bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Dependencies</p>
            <p className="text-lg font-semibold text-foreground">0</p>
          </div>
          <div className="rounded-md border border-border/50 bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Tab sync</p>
            <p className="text-lg font-semibold text-foreground">BroadcastChannel</p>
          </div>
          <div className="rounded-md border border-border/50 bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">SSR safety</p>
            <p className="text-lg font-semibold text-foreground">warn + opt-in</p>
          </div>
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Used in</span>
          <span className="rounded-md border border-border/50 px-2 py-1">Dashboard starter</span>
          <span className="rounded-md border border-border/50 px-2 py-1">Docs site</span>
          <span className="rounded-md border border-border/50 px-2 py-1">Internal tooling</span>
          <span className="rounded-md border border-border/50 px-2 py-1">Playground</span>
        </div>
      </section>

      <DocsH2 id="philosophy">Philosophy</DocsH2>
      <DocsParagraph>
        State management shouldn't require choosing between simplicity and power. stroid keeps the
        API small: you create a named store once, read with <DocsInlineCode>useStore</DocsInlineCode>,
        and update with <DocsInlineCode>setStore</DocsInlineCode>. No providers, no middleware
        stacking, no boilerplate.
      </DocsParagraph>

      <DocsParagraph>
        Every store is <DocsInlineCode>fully typed</DocsInlineCode> end to end. TypeScript infers
        state shape from <DocsInlineCode>createStore</DocsInlineCode> into selectors and
        <DocsInlineCode>setStore</DocsInlineCode> without manual generics.
      </DocsParagraph>

      <DocsH2 id="core-ideas">Core Ideas</DocsH2>
      <DocsParagraph>
        stroid is built on four principles:
      </DocsParagraph>

      <ul className="mt-4 flex flex-col gap-3 pl-6 text-muted-foreground">
        <li className="list-disc text-sm leading-relaxed">
          <strong className="text-foreground">Mutable syntax, immutable updates.</strong>{" "}
          Write mutations inside <DocsInlineCode>setStore</DocsInlineCode> and stroid handles structural sharing for you.
        </li>
        <li className="list-disc text-sm leading-relaxed">
          <strong className="text-foreground">Selector-based subscriptions.</strong>{" "}
          Components only re-render when the specific slice of state they select changes.
        </li>
        <li className="list-disc text-sm leading-relaxed">
          <strong className="text-foreground">Batteries included.</strong>{" "}
          Persistence, tab sync, async fetch helpers, and DevTools are built in â€” not afterthought plugins.
        </li>
        <li className="list-disc text-sm leading-relaxed">
          <strong className="text-foreground">Zero dependencies.</strong>{" "}
          The core ships with no external runtime dependencies.
        </li>
      </ul>

      <DocsH2 id="quick-example">Quick Example</DocsH2>
      <DocsCode filename="users.tsx">{`import { createStore, setStore, useStore } from 'stroid'

// 1) Declare a named store once at module scope
createStore('users', {
  list: [] as { id: string; name: string }[],
})

// 2) Update it anywhere (mutable draft; immutable under the hood)
export function addUser(user: { id: string; name: string }) {
  setStore('users', (draft) => {
    draft.list.push(user)
  })
}

// 3) Read inside React components
export function UsersBadge() {
  const count = useStore('users', (s) => s.list.length)
  return <span>{count} users</span>
}`}</DocsCode>

    </article>
  )
}

