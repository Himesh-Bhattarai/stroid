# 🖥️ Server / SSR Guide

> **Version:** 0.1.4 &nbsp;|&nbsp; **Last Updated:** 2026-04-02 &nbsp;|&nbsp; **Confidence:** ![HIGH](https://img.shields.io/badge/confidence-HIGH-brightgreen)
>
> *Derived from `src/server/index.ts`, `src/core/store-registry.ts`*

---

## 📚 Table of Contents

- [Why SSR-Safe?](#-why-ssr-safe)
- [Support Matrix](#-support-matrix)
- [Setup](#-setup)
- [createStoreForRequest](#-createstorefor-request)
- [API: RequestStoreApi](#-api-requeststoreapi)
- [Hydration](#-hydration)
- [Post-Hydration Consistency](#-post-hydration-consistency)
- [Framework Boundaries](#-framework-boundaries)
- [Practical Example](#-practical-example)
- [Request Isolation](#-request-isolation)
- [AsyncLocalStorage](#-asynclocalstorage)

---

## 🎯 Why SSR-Safe?

Stroid is SSR-safe on **Node.js runtimes** because `stroid/server` uses `AsyncLocalStorage`. This means:

- Each HTTP request gets its own **isolated store registry**
- Multiple concurrent requests don't cross-contaminate state
- No global state pollution — each request is a clean slate
- Seamless hydration from server to client

```ts
// Request 1: createStore("user", { id: 1, name: "Alice" })
// Request 2: createStore("user", { id: 2, name: "Bob" })
// No collision — each request has its own registry
```

---

## 🧭 Support Matrix

| Environment / Boundary | Status | Read |
| --- | --- | --- |
| Node SSR server with `stroid/server` | Supported | `createStoreForRequest(...).hydrate(...)` runs inside a Node `AsyncLocalStorage` request scope |
| Node-style warm-container reuse | Locally certified | `benchmark:ssr-warm` covers repeated request reuse plus detached post-lifecycle probes in one long-lived process |
| AWS Lambda / Vercel / custom Node serverless | Deployment-specific | The runtime model matches Node, but you should still run platform-specific integration tests before claiming production certification |
| Cloudflare Workers / Edge runtimes | Not supported by `stroid/server` today | `stroid/server` imports `node:async_hooks`, so a dedicated edge adapter would be required |
| Next.js App Router render on Node | Supported with Node boundary | Use `createStoreForRequest(...).hydrate(...)` around the render path |
| Next.js Server Actions | Manual boundary | Server Actions execute in a separate server invocation context; Stroid does not auto-propagate request carriers across that boundary |
| Third-party singleton state libraries | Out of guarantee scope | Stroid can only isolate state written through Stroid-managed APIs and registries |

Read this table as a support boundary, not a marketing claim about every host automatically behaving the same.

---

## ⚙️ Setup

```ts
import { createStoreForRequest } from "stroid/server"
import { hydrateStores } from "stroid"

// In your Node request handler (Express, Fastify, Next.js on Node, etc.)
async function handleRequest(req, res) {
  const stores = createStoreForRequest()

  // Create stores for this request
  stores.create("user", { id: 1, name: "Alice" })

  // Render your app
  const html = stores.hydrate(() => {
    const { default: App } = require("./App")
    const { renderToString } = require("react-dom/server")
    return renderToString(<App />)
  })

  // Send to client with snapshot
  res.send(`
    <div id="app">${html}</div>
    <script>
      window.__INITIAL_STATE__ = ${JSON.stringify(stores.snapshot())}
    </script>
  `)
}
```

---

## 📦 createStoreForRequest()

**Type:**
```ts
createStoreForRequest<StateMap>(
  initializer?: (api: RequestStoreApi<StateMap>) => void
): RequestStoreContext<StateMap>
```

**Creates a new isolated store registry** for a single request.

**Example:**
```ts
import { createStoreForRequest } from "stroid/server"

const stores = createStoreForRequest(({ create, set, get, snapshot }) => {
  create("user", { id: 1, name: "Alice" })
  create("posts", [])

  // Sync stores during creation
  const user = get("user")
  console.log(`Loading posts for ${user?.name}`)
})

// Later, render with this request's stores
const html = stores.hydrate(() => renderToString(<App />))

// Send snapshot to client for hydration
const initialState = stores.snapshot()
```

---

## 🎛️ API: RequestStoreApi

The `initializer` callback receives an API for managing request-scoped stores.

### create(name, initialValue, options?)

Creates a store in the request registry.

```ts
stores.create("user", { id: 1, name: "Alice" })
stores.create("posts", [], { validators: postValidator })
```

**Type:**
```ts
create<Name>(
  name: Name,
  data: StateValue,
  options?: StoreOptions<StateValue>
): StateValue
```

### set(name, updater)

Updates a request store (mutator function).

```ts
stores.set("user", (draft) => {
  draft.name = "Bob"
})

// Or with object merge
stores.set("user", { name = "Bob" })
```

**Type:**
```ts
set<Name>(
  name: Name,
  updater: StateValue | ((draft: StateValue) => void)
): StateValue
```

> [!NOTE]
> Must call `create(name, ...)` before `set(name, ...)`.

### get(name)

Reads a request store snapshot.

```ts
const user = stores.get("user")
console.log(user?.name)
```

**Returns:** Deep clone of the store, or `undefined` if not created.

**Type:**
```ts
get<Name>(name: Name): StateValue | undefined
```

### snapshot()

Returns all created stores as an object (for hydration).

```ts
const state = stores.snapshot()
// { user: {...}, posts: [...], ... }
```

**Type:**
```ts
snapshot(): Record<string, unknown>
```

---

## 🌊 Hydration

**Method:**
```ts
hydrate<T>(
  renderFn: () => T,
  options?: RequestHydrateOptions<StateMap>
): T
```

**Executes code inside the request registry context** so that all store operations use the request's stores.

### Basic Usage

```ts
const html = stores.hydrate(() => {
  // Inside here: useStore, getStore, createStore all use this request's stores
  return renderToString(<App />)
})
```

### With Options

Pass validation options for each store:

```ts
const html = stores.hydrate(
  () => renderToString(<App />),
  {
    user: { validators: userValidator },
    posts: { validators: postsValidator },
    default: { cloneMode: "shallow" } // For all non-specified stores
  }
)
```

---

## 🛡️ Post-Hydration Consistency

`hydrateStores(...)` now accepts an optional fourth `consistency` argument on the client.
Use it when the server snapshot is trusted, but you still want bounded behavior once browser-only writes begin.

```ts
const hydration = hydrateStores(window.__INITIAL_STATE__, {}, { allowTrusted: true }, {
  contract: {
    snapshotVersion: 3,
    timestamp: Date.now(),
    stores: {
      session: { authority: "server-authoritative" },
      draft: { authority: "client-authoritative" },
      filters: { authority: "mergeable" },
    },
  },
  bootWindow: {
    mode: "manual",
    fallbackMs: 3000,
  },
  policyMap: {
    session: "server_wins",
    draft: "client_wins",
    filters: "merge",
  },
})

hydration.bootWindow?.close()
```

`hydration.bootWindow?.close()` should be called from the readiness boundary your app controls, not guessed with an arbitrary timeout when you can avoid it.

The consistency layer can:

- defer early `effect`, `storage`, `network`, and `sync` writes during the boot window
- replay queued writes in deterministic order once hydration settles
- emit structured drift events through `consistency.onDrift`
- reconcile each store with `server_wins`, `client_wins`, `merge`, or `invalidate_and_refetch`

Manual close is the strongest contract. Short timers are still supported, but they are best-effort because they guess when hydration is done.

---

## 🚧 Framework Boundaries

Stroid's request carrier is a Node SSR runtime boundary, not a universal framework bridge.

- Next.js App Router server rendering on Node fits the model: create a request scope, render inside `.hydrate(...)`, and hydrate the client snapshot normally.
- Next.js Server Actions do not automatically inherit the original request carrier. Pass the data you need explicitly, or recreate a new server-side boundary for the action.
- If you compose Stroid with libraries that keep their own global singleton store, cache, or client instance, Stroid cannot isolate those writes for you.
- Edge runtimes are outside the current `stroid/server` implementation because the package depends on `node:async_hooks`.

For the full contract, adoption defaults, and runtime-tools inspection APIs, see [Post-Hydration Consistency](./POST_HYDRATION_CONSISTENCY.md).

---

## 📋 Practical Example

### Express.js Server

```ts
import express from "express"
import { createStoreForRequest } from "stroid/server"
import { renderToString } from "react-dom/server"
import App from "./App"

const app = express()

app.get("*", async (req, res) => {
  const stores = createStoreForRequest(async ({ create, get }) => {
    // Load data from database
    const user = await db.users.findOne({ id: req.user?.id })
    const posts = await db.posts.findMany({ userId: req.user?.id })

    create("user", user || null)
    create("posts", posts)
  })

  try {
    const html = stores.hydrate(() => {
      return renderToString(<App />)
    })

    res.send(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="app">${html}</div>
          <script>
            window.__INITIAL_STATE__ = ${JSON.stringify(stores.snapshot())}
          </script>
        </body>
      </html>
    `)
  } catch (error) {
    res.status(500).send("Server error")
  }
})

app.listen(3000)
```

### Client-Side Hydration

```ts
// client.tsx
import { hydrateStores } from "stroid"
import { hydrateRoot } from "react-dom/client"
import App from "./App"

const initialState = window.__INITIAL_STATE__

hydrateStores(initialState, {}, { allowTrusted: true })

hydrateRoot(document.getElementById("app")!, <App />)
```

---

## 🔒 Request Isolation

Each request is **completely isolated**:

```ts
// Request A
const storesA = createStoreForRequest(({ create }) => {
  create("user", { id: 1, name: "Alice" })
})

// Request B (concurrent)
const storesB = createStoreForRequest(({ create }) => {
  create("user", { id: 2, name: "Bob" })
})

storesA.snapshot().user.name // "Alice" ✅
storesB.snapshot().user.name // "Bob" ✅

// No cross-contamination!
```

---

## 🔧 AsyncLocalStorage

Stroid uses Node.js `AsyncLocalStorage` to manage request context automatically.

**How it works:**

1. `createStoreForRequest()` creates a new `AsyncLocalStorage` context
2. `hydrate()` enters that context
3. All store operations inside `hydrate()` use the request's registry
4. When `hydrate()` returns, the context is cleaned up

```ts
const stores = createStoreForRequest()

stores.hydrate(() => {
  // Inside here:
  createStore("user", { ... })     // ✅ Uses request registry
  getStore("user")                  // ✅ Uses request registry
  useStore("user")                  // ✅ (React) Uses request registry
})

// Outside here:
getStore("user")                    // ❌ Uses global registry
```

---

## ⚠️ Common Pitfalls

### Don't Create Stores Outside hydrate()

```ts
// ❌ Wrong
const stores = createStoreForRequest()
createStore("user", { ... }) // Goes to GLOBAL registry, not request!

stores.hydrate(() => renderToString(<App />))
```

```ts
// ✅ Right
const stores = createStoreForRequest(({ create }) => {
  create("user", { ... }) // Use the API
})

stores.hydrate(() => renderToString(<App />))
```

### Don't Use Global Stores in Requests

```ts
// ❌ Wrong
import { useStore } from "stroid/react"

export function App() {
  const user = useStore("user") // Watches GLOBAL registry, not request!
}
```

```ts
// ✅ Right
const stores = createStoreForRequest(({ create }) => {
  create("user", fetchUserData())
})

stores.hydrate(() => {
  // Now useStore watches the request registry
  return renderToString(<App />)
})
```

---

## 🔄 Snapshot for Client Hydration

Always snapshot before sending to client:

```ts
const snapshot = stores.snapshot() // { user: {...}, posts: [...] }

// Send to client
res.send(`
  <script>
    window.__INITIAL_STATE__ = ${JSON.stringify(snapshot)}
  </script>
`)

// Client hydrates
hydrateStores(window.__INITIAL_STATE__, {}, { allowTrusted: true })
```

---

## 📚 Related Guides

- **Core Concepts:** [Stores](../STROID_CORE/INDEX.md)
- **React Integration:** [React Hooks](../STROID_REACT/INDEX.md)
- **Hydration:** [Server Hydration](../STROID_SERVER/INDEX.md#-hydration)
