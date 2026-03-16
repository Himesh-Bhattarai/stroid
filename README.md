# Stroid

[![npm](https://img.shields.io/npm/v/stroid)](https://npmjs.com/package/stroid)
[![bundle size](https://img.shields.io/bundlephobia/minzip/stroid)](https://bundlephobia.com/package/stroid)
[![types](https://img.shields.io/npm/types/stroid)](https://npmjs.com/package/stroid)
[![license](https://img.shields.io/npm/l/stroid)](./LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/Himesh-Bhattarai/stroid/ci.yml)](https://github.com/Himesh-Bhattarai/stroid/actions)

**Named-store state engine for TypeScript and React.**  
Every store has a name. Write to it from anywhere — hooks, utilities, server, tests. Optional layers add persistence, sync, async fetch, SSR isolation, and devtools without touching your core logic.

> 🚀 **Power in 4 lines:** Create a store, read/write it, optionally persist, sync, or hydrate for SSR.

```tsx
createStore("user", { name: "Ava", role: "admin" })           // define once
setStore("user", "name", "Kai")                                // write from anywhere
const name = useStore("user", s => s.name)                     // React hook
```

---

## Layers

```
┌─────────────────────────────────────────────────────────┐
│                        your app                         │
├─────────────────────────────────────────────────────────┤
│  useStore  useSelector  useAsyncStore  useFormStore      │  stroid/react
├─────────────────────────────────────────────────────────┤
│  createStore  setStore  getStore  setStoreBatch          │  stroid  ← core
│  createComputed  createSelector  createEntityStore       │
├──────────────┬──────────────┬───────────────────────────┤
│ stroid/persist│ stroid/sync  │ stroid/async              │  opt-in features
│ localStorage  │ BroadcastCh  │ fetch + cache + retry     │
├──────────────┴──────────────┴───────────────────────────┤
│  stroid/server   createStoreForRequest (AsyncLocalStorage)│  SSR
├─────────────────────────────────────────────────────────┤
│  stroid/devtools   stroid/testing   stroid/runtime-tools │  tooling
└─────────────────────────────────────────────────────────┘
```

Each row is independent. Use only what you need.

Note: `stroid/core` exports only `createStore`, `setStore`, `getStore`, `hasStore`, `resetStore`, and `deleteStore`. Import from `stroid` for the full core runtime (batching, hydration, and hooks).

---

## Install

```bash
npm install stroid
```

> **Note:** `main` is locked between releases. Active development is on the `dev` branch — PRs and forks should target `dev`. Commit messages follow [STATUS.md](./STATUS.md) conventions.

---

## Quick API Reference

| API | Purpose |
|-----|---------|
| `createStore(name, state, options?)` | Define a store |
| `setStore(name, path, value)` | Write a value by path |
| `setStore(name, draft => { })` | Mutate with a function |
| `replaceStore(name, value)` | Replace an entire store |
| `getStore(name, path?)` | Read a store (or a path inside it) |
| `setStoreBatch(fn)` | Atomic multi-store write, rollback on error |
| `useStore(name, selector?)` | React hook — subscribes to a store |
| `useSelector(name, fn)` | React hook — fine-grained derived value |
| `fetchStore(name, url, options?)` | Async fetch wired to store state |
| `createComputed(name, deps, fn)` | Reactive derived store |
| `createStoreForRequest(fn)` | Per-request SSR registry |
| `hydrateStores(snapshot)` | Rehydrate on client from server state |

---

## Quick Start

Three levels. Start where you are.

---

### Level 1 — The Basics

**Create a store. Read it. Write to it.**

```ts
import { createStore, getStore, setStore } from "stroid"

createStore("counter", { count: 0 })

setStore("counter", "count", 1)
console.log(getStore("counter")) // { count: 1 }
```

**Use it in React.**

```tsx
import { useStore } from "stroid/react"

function Counter() {
  const count = useStore("counter", s => s.count)
  return (
    <button onClick={() => setStore("counter", "count", count + 1)}>
      {count}
    </button>
  )
}
```

**Batch multiple writes — one notification, atomic rollback.**

```ts
import { setStoreBatch, setStore } from "stroid"

setStoreBatch(() => {
  setStore("cart",   { items: [{ id: 1, price: 12 }] })
  setStore("ui",     "loading", false)
  setStore("user",   "lastSeen", Date.now())
  // if any write throws → all three roll back
})
```

**Typed store handle — trade string keys for compile-time safety.**

```ts
import { store, createStore, setStore, getStore } from "stroid"

const counter = store<"counter", { count: number }>("counter")

createStore("counter", { count: 0 })
setStore(counter, draft => { draft.count += 1 })
console.log(getStore(counter, "count")) // 1
```

**Type-safe string store names (module augmentation).**

If you prefer `useStore("user")` and `setStore("user", ...)` with compile-time checking,
augment `StoreStateMap` or `StrictStoreMap` in a `.d.ts` file:

```ts
// src/stroid.d.ts
declare module "stroid" {
  interface StoreStateMap {
    user: {
      name: string
      role: "admin" | "user"
    }
  }
}

// Optional strict opt-in for locked store names:
// declare module "stroid" { interface StrictStoreMap { user: ... } }
// If you import from "stroid/core", add the same module augmentation there.
```


---

### Level 2 — Real Features

**Persist to localStorage — survives page reload.**

> ⚡ **Tip:** Add `import "stroid/persist"` once at your app entry (e.g. `main.tsx`) to enable persistence globally. Any store with a `persist` option will activate automatically.

```ts
import { createStore } from "stroid"
import "stroid/persist"

createStore("settings", { theme: "dark", lang: "en" }, {
  persist: {
    key:            "app-settings",
    allowPlaintext: true,
    version:        2,
    migrate:        (old, v) => v === 1 ? { ...old, lang: "en" } : old,
  }
})
```

**Sync across browser tabs — zero wiring.**

> ⚡ **Tip:** Add `import "stroid/sync"` once at app entry. Any store with `sync: true` or `sync: { channel }` will start broadcasting automatically.

```ts
import { createStore } from "stroid"
import "stroid/sync"

createStore("presence", { online: true, cursor: null }, {
  sync: { channel: "presence-sync" }
  // Lamport clock conflict resolution built in.
  // Stale messages from closed tabs auto-rejected.
})
```

**Persist + sync together.**

```ts
import { createStore } from "stroid"
import "stroid/persist"
import "stroid/sync"

createStore("settings", { theme: "dark", lang: "en" }, {
  persist: { key: "app-settings", allowPlaintext: true },
  sync:    { channel: "settings-sync" },
})
// Change in one tab → persisted locally + broadcast to all other tabs.
```

**Async fetch — SWR-style, wired directly to store state.**

> ⚡ **Tip:** `fetchStore` manages `loading`, `error`, `data`, and `status` fields automatically. No separate state machine needed — just read `useStore("user")`.

```ts
import { createStore }  from "stroid"
import { fetchStore }   from "stroid/async"
import { useStore }     from "stroid/react"

createStore("user", { data: null, loading: false, error: null, status: "idle" })

const controller = new AbortController()

fetchStore("user", "/api/user", {
  signal:             controller.signal,
  ttl:                30_000,             // 30s cache
  staleWhileRevalidate: true,             // show stale, revalidate in background
  dedupe:             true,               // concurrent calls share one request
  retry:              3,                  // auto-retry on failure
  retryDelay:         400,
  transform:          res => res.data,    // shape the response
  onSuccess:          data => console.log("fetched", data),
  onError:            err  => Sentry.captureException(err),
})

function UserCard() {
  const user = useStore("user")
  if (user?.loading) return <Spinner />
  if (user?.error)   return <Error message={user.error} />
  return <div>{user?.data?.name}</div>
}
```

**Computed stores — reactive, cached, cycle-safe.**

```ts
import { createStore }   from "stroid"
import { createComputed } from "stroid/computed"

createStore("cart",     { items: [] })
createStore("discount", { pct: 10 })

createComputed(
  "cartTotal",
  ["cart", "discount"],
  (cart, discount) => {
    const raw = cart.items.reduce((sum, i) => sum + i.price, 0)
    return raw * (1 - discount.pct / 100)
  }
)

// cartTotal updates whenever cart or discount changes.
// Circular dependency detected at definition time.
// Flush order is topologically sorted — always correct.
```

**Entity store — built-in CRUD for collections.**

```ts
import { createEntityStore } from "stroid/helpers"

const users = createEntityStore("users")

users.upsert({ id: "1", name: "Ava",  role: "admin" })
users.upsert({ id: "2", name: "Kai",  role: "user"  })

console.log(users.get("1"))       // { id: "1", name: "Ava", role: "admin" }
console.log(users.getAll())       // [{ id: "1" }, { id: "2" }]

users.remove("2")
```

---

### Level 3 — Production Patterns

**SSR with per-request isolation — no cross-request leaks.**

```ts
// app/api/render/route.ts  (Next.js App Router)
import { createStoreForRequest } from "stroid/server"
import { renderToString }        from "react-dom/server"

export async function GET(req: Request) {
  const session = await getSession(req)

  // Each request gets a fully isolated registry.
  // AsyncLocalStorage ensures concurrent requests
  // never share store values or subscribers.
  const stores = createStoreForRequest((api) => {
    api.create("user",    { name: session.user.name, role: session.user.role })
    api.create("cart",    { items: [] })
    api.create("flags",   session.featureFlags)
  })

  const html  = stores.hydrate(() => renderToString(<App />))
  const state = stores.snapshot() // plain JSON → send to client

  return Response.json({ html, state })
}

// Client: rehydrate from server snapshot
hydrateStores(window.__STROID_STATE__)

Tip: For typed SSR APIs, either augment `StoreStateMap` or pass a generic:
`createStoreForRequest<{ user: UserState }>((api) => { ... })`.
```

**Middleware — intercept, transform, or veto any write.**

```ts
createStore("cart", { items: [], total: 0 }, {
  middleware: (ctx) => {
    // ctx.action = "set" | "reset" | "hydrate"
    // ctx.prev   = previous state
    // ctx.next   = incoming state
    // return MIDDLEWARE_ABORT to cancel the write
    if (ctx.action === "set" && ctx.next.items.length > 100) {
      ctx.options.onError?.("Cart limit exceeded")
      return MIDDLEWARE_ABORT
    }
    // log every write to your analytics
    analytics.track("cart.updated", { prev: ctx.prev, next: ctx.next })
    return ctx.next
  }
})
```

**Persist with encryption — no plaintext secrets in localStorage.**

```ts
import { createStore } from "stroid"
import "stroid/persist"

createStore("vault", { apiKey: "", token: "" }, {
  persist: {
    key:     "secure-vault",
    encrypt: (data)  => myAES.encrypt(JSON.stringify(data)),
    decrypt: (raw)   => JSON.parse(myAES.decrypt(raw)),
    // sensitiveData: true blocks persist entirely if no encrypt is provided
    sensitiveData: true,
    onStorageCleared: ({ name, reason }) => {
      // fires when localStorage is cleared externally (another tab, devtools, etc.)
      console.warn(`${name} storage cleared: ${reason}`)
      redirectToLogin()
    },
  }
})
```

**Observability — inspect any store at runtime.**

> ⚡ **Tip:** Add `import "stroid/devtools"` at app entry to enable time-travel history and store inspection. Use `getMetrics(name)` in production to track notification performance per store.

```ts
import { getMetrics, getSubscriberCount, getComputedGraph } from "stroid/runtime-tools"

// Per-store performance metrics
const m = getMetrics("cart")
// { notifyCount: 42, totalNotifyMs: 8.3, lastNotifyMs: 0.2 }

// How many components are subscribed right now
console.log(getSubscriberCount("cart")) // 3

// Full computed dependency graph
console.log(getComputedGraph())
// { nodes: ["cartTotal"], edges: [{ from: "cart", to: "cartTotal" }] }
```

**Global flush configuration — tune for your app's load profile.**

```ts
import { configureStroid } from "stroid"

configureStroid({
  // Route internal logs to your observability platform
  logSink: {
    warn:     msg => Sentry.captureMessage(msg, "warning"),
    critical: msg => Sentry.captureException(new Error(msg)),
  },

  // Priority stores notify subscribers first
  flush: {
    priorityStores: ["auth", "user"],
  },

  // Revalidate async stores when tab regains focus
  revalidateOnFocus: {
    debounceMs:    500,
    maxConcurrent: 3,
    staggerMs:     100,
  },
})
```

**Large store performance (recommendations).**

- Split stores by domain to keep hot updates small.
- For large lists, prefer `snapshot: "shallow"` per store or `configureStroid({ snapshotStrategy: "shallow" })` globally.
- Prefer path updates and targeted selectors (`useSelector`, `useStoreField`) over whole-store subscriptions.

**Optional structural sharing for mutator updates.**

```ts
import { configureStroid } from "stroid"
import { produce } from "immer"

configureStroid({ mutatorProduce: produce })
```

If you prefer a shorthand, set `globalThis.__STROID_IMMER_PRODUCE__ = produce` once and use `configureStroid({ mutatorProduce: "immer" })`.

**Testing — deterministic, isolated, zero globals.**

```ts
import { createMockStore, resetAllStoresForTest } from "stroid/testing"

beforeEach(() => resetAllStoresForTest())

test("cart total updates when item added", () => {
  const cart = createMockStore("cart", { items: [] })

  setStore("cart", "items", [{ id: 1, price: 50 }])

  expect(getStore("cart", "items")).toHaveLength(1)
  expect(getStore("cartTotal")).toBe(45) // with 10% discount
})
```

---

## Module Imports

```ts
// Core
import { createStore, setStore, getStore, deleteStore,
         resetStore, hasStore, setStoreBatch, hydrateStores } from "stroid"

// React
import { useStore, useSelector, useStoreField,
         useAsyncStore, useFormStore, useAsyncStoreSuspense } from "stroid/react"

// Async
import { fetchStore, refetchStore, enableRevalidateOnFocus } from "stroid/async"

// Selectors & Computed
import { createSelector, subscribeWithSelector } from "stroid/selectors"
import { createComputed, deleteComputed }         from "stroid/computed"

// Features (side-effect imports — register once at app entry)
import "stroid/persist"
import "stroid/sync"
import "stroid/devtools"

// Server / SSR
import { createStoreForRequest } from "stroid/server"

// Helpers & Testing
import { createEntityStore, createCounterStore } from "stroid/helpers"
import { createMockStore, resetAllStoresForTest } from "stroid/testing"

// Runtime
import { listStores, getMetrics, getComputedGraph } from "stroid/runtime-tools"
import { clearAllStores }                            from "stroid/runtime-admin"
```

---

## Feature Plugins (Advanced)

Stroid exposes a public feature hook contract for plugin authors via `stroid/feature`:

```ts
import type { FeatureHookContext, FeatureWriteContext, FeatureDeleteContext } from "stroid/feature"
import { registerStoreFeature } from "stroid/feature"

registerStoreFeature("myFeature", () => ({
  onStoreCreate(ctx: FeatureHookContext) {},
  onStoreWrite(ctx: FeatureWriteContext) {},
  beforeStoreDelete(ctx: FeatureDeleteContext) {},
}))
```

`FeatureHookContext` is the stable base contract. Write/delete contexts extend it with `action`, `prev`, and `next`.
Third-party authors can target the exported types without reaching into internal modules.

---

## Behavior Notes

- **Features are explicit.** `persist`, `sync`, and `devtools` require a side-effect import. Nothing loads you didn't ask for.
- **Snapshot mode defaults to deep clone.** Subscribers and selectors always receive immutable snapshots.
- **`setStoreBatch` is transactional.** All writes stage first. Commit happens only if the batch completes without error. On failure, all writes roll back.
- **`setStore(name, data)` merges objects.** It shallow-merges into object stores. Use `replaceStore(name, value)` to replace the whole store.
- **Typed string store names are opt-in.** If you want `setStore("user", "profile.name", ...)` to be checked, augment `StoreStateMap` or use typed store handles.
- **SSR stores are request-scoped by default.** Global SSR stores require `{ allowSSRGlobalStore: true }`.
- **`fetchStore` deduplicates by default.** Concurrent calls with the same store name share one in-flight request.
- **Computed deps can be store names or handles.** Missing deps yield `null` until the dependency store is created.
- **Persist defaults to `localStorage`.** Provide a custom `driver` for `sessionStorage`, `IndexedDB`, or any storage adapter.
- **Sync uses `BroadcastChannel`.** Warns and no-ops gracefully when unavailable (Safari private mode, Node).

---

## Docs

Full documentation, architecture guide, and examples:

- [Start Here](./docs/start-here.md)
- [Core API](./docs/core.md)
- [React Layer](./docs/react.md)
- [Async Layer](./docs/async.md)
- [Persistence](./docs/persist.md)
- [Cross-tab Sync](./docs/sync.md)
- [Server & SSR](./docs/server.md)
- [Computed Stores](./docs/computed.md)
- [Selectors](./docs/selectors.md)
- [Testing](./docs/testing.md)
- [Devtools](./docs/devtools.md)
- [Runtime Tools](./docs/runtime.md)

---

## Changelog & License

- [CHANGELOG](./CHANGELOG.md)
- [MIT License](./LICENSE)
- [Issues](https://github.com/Himesh-Bhattarai/stroid/issues)
