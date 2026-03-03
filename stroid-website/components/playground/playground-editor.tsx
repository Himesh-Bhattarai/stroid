"use client"

import { useState } from "react"
import { Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"

type Template = {
  id: string
  label: string
  code: string
  output: string
}

const templates: Template[] = [
  {
    id: "counter",
    label: "Level 1 · Counter",
    code: `import { createStore, useStore } from 'stroid'

const counterStore = createStore({
  count: 0,
  increment: (s) => { s.count++ },
  decrement: (s) => { s.count-- },
  reset: (s) => { s.count = 0 },
})

function Counter() {
  const count = useStore(counterStore, (s) => s.count)
  const actions = useStore(counterStore, (s) => ({
    increment: s.increment,
    decrement: s.decrement,
    reset: s.reset,
  }))

  return (
    <div className="flex items-center gap-4">
      <button onClick={actions.decrement}>-</button>
      <span className="text-2xl font-bold">{count}</span>
      <button onClick={actions.increment}>+</button>
      <button onClick={actions.reset}>Reset</button>
    </div>
  )
}`,
    output: `Level 1 (Basic):
{ count: 0 } -> { count: 1 } -> { count: 2 } -> { count: 1 } -> { count: 0 }
Only Counter re-renders thanks to s => s.count.`,
  },
  {
    id: "todos",
    label: "Level 2 · Todos + Selectors",
    code: `import { createStore, useStore } from 'stroid'

type Filter = 'all' | 'active' | 'done'
type Todo = { id: number; text: string; done: boolean }

const todoStore = createStore({
  todos: [] as Todo[],
  filter: 'all' as Filter,

  addTodo: (s, text: string) => { s.todos.push({ id: Date.now(), text, done: false }) },
  toggleTodo: (s, id: number) => { const t = s.todos.find(t => t.id === id); if (t) t.done = !t.done },
  removeTodo: (s, id: number) => { s.todos = s.todos.filter(t => t.id !== id) },
  setFilter: (s, f: Filter) => { s.filter = f },

  filteredTodos: (s) => s.filter === 'all'
    ? s.todos
    : s.todos.filter(t => s.filter === 'done' ? t.done : !t.done),
})

function TodoList() {
  const todos = useStore(todoStore, (s) => s.filteredTodos)
  return <ul>{todos.map((t) => <li key={t.id}>{t.text}</li>)}</ul>
}`,
    output: `Level 2 (Selectors + computed):
addTodo -> toggleTodo -> setFilter; filteredTodos derives from filter.`,
  },
  {
    id: "async",
    label: "Level 3 · Async + Persistence",
    code: `import { createStore, useStore } from 'stroid'

type Status = 'idle' | 'loading' | 'success' | 'error'
type User = { id: string; name: string; email: string }

const userStore = createStore({
  user: null as User | null,
  status: 'idle' as Status,
  error: null as string | null,

  fetchUser: async (s, id: string) => {
    s.status = 'loading'; s.error = null
    try {
      const res = await fetch(\`/api/users/\${id}\`)
      if (!res.ok) throw new Error('Not found')
      s.user = await res.json()
      s.status = 'success'
    } catch (err) {
      s.error = err instanceof Error ? err.message : 'Error'
      s.status = 'error'
    }
  },
  logout: (s) => { s.user = null; s.status = 'idle' },
}, {
  persist: { key: 'user-session', driver: localStorage },
  sync: true,
  devtools: true,
  historyLimit: 100,
})

function UserBadge() {
  const { user, status } = useStore('user', (s) => ({ user: s.user, status: s.status }))
  return <span>{status === 'loading' ? 'Loading...' : user?.name ?? 'Guest'}</span>
}`,
    output: `Level 3 (Async/persist/sync/devtools):
fetchUser -> loading -> success/error; state persisted to localStorage, synced across tabs, visible in Redux DevTools.`,
  },
  {
    id: "entity",
    label: "Level 4 · Entity Store + Metrics",
    code: `import { createEntityStore, getHistory, getMetrics } from 'stroid'

type Product = { id: string; name: string; price: number }

const products = createEntityStore<Product>('products', { devtools: true, historyLimit: 200 })

products.upsert({ id: 'p1', name: 'Keyboard', price: 120 })
products.upsert({ id: 'p2', name: 'Mouse', price: 45 })
products.remove('p1')

const history = getHistory('products', 5)
const metrics = getMetrics('products')

console.log(history)
console.log(metrics)`,
    output: `Level 4 (Entity + history/metrics):
history: recent actions + shallow diffs
metrics: notify timings for subscribers.`,
  },
  {
    id: "ssr",
    label: "Level 5 · SSR Snapshot (Ultra)",
    code: `import { createStoreForRequest, hydrateStores, useStore } from 'stroid'

// Server (per request)
export function loadSnapshot(user) {
  const { snapshot, hydrate } = createStoreForRequest((api) => {
    api.create('user', user, { allowSSRGlobalStore: false })
  })
  return { snapshot: snapshot(), hydrate }
}

// Client
export function hydrateClient(snapshot) {
  hydrateStores(snapshot, { default: { devtools: true } })
}

function UserBadge() {
  const name = useStore('user', (s) => s.name)
  return <span>{name}</span>
}`,
    output: `Level 5 (SSR):
Request-scoped store on server; snapshot hydrated on client without cross-request leaks.`,
  },
]

export function PlaygroundEditor() {
  const [activeTemplate, setActiveTemplate] = useState("counter")
  const [copied, setCopied] = useState(false)

  const active = templates.find((t) => t.id === activeTemplate) ?? templates[0]

  const handleCopy = () => {
    navigator.clipboard.writeText(active.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Code Editor */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
          <div className="flex items-center gap-1">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTemplate(t.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTemplate === t.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={handleCopy} aria-label="Copy code">
              {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
            </Button>
          </div>
        </div>

        {/* File label */}
        <div className="flex items-center border-b border-border/50 bg-muted/20 px-4 py-1.5">
          <span className="font-mono text-xs text-muted-foreground/60">playground.tsx</span>
        </div>

        {/* Code */}
        <div className="max-h-[500px] overflow-auto p-5">
          <pre className="font-mono text-sm leading-relaxed text-foreground/90">
            <code>{active.code}</code>
          </pre>
        </div>
      </div>

      {/* Output Panel */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
          <span className="text-xs font-medium text-muted-foreground">Output</span>
          <div className="flex items-center gap-1.5">
            <div className="size-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs text-primary">Ready</span>
          </div>
        </div>

        {/* Output content */}
        <div className="max-h-[500px] overflow-auto p-5">
          <pre className="font-mono text-sm leading-relaxed text-muted-foreground">
            <code>{active.output}</code>
          </pre>
        </div>

        {/* State inspector */}
        <div className="border-t border-border bg-muted/20 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">State Inspector</p>
          <div className="mt-2 rounded-md bg-background p-3">
            <pre className="font-mono text-xs text-foreground/80">
              {activeTemplate === "counter" && '{ "count": 0 }'}
              {activeTemplate === "todos" && '{ "todos": [], "filter": "all" }'}
              {activeTemplate === "async" && '{ "user": null, "status": "idle", "error": null }'}
              {activeTemplate === "entity" && '{ "entities": {}, "ids": [] }'}
              {activeTemplate === "ssr" && '{ "snapshot": { ... } }'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
