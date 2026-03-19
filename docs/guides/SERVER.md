# Server & SSR Guide

> **Confidence: HIGH** — derived from `src/server/index.ts`, `src/core/store-registry.ts`.

---

## The Problem

Global store registries in SSR environments cause cross-request data leaks — one request's user data bleeds into another's. Stroid solves this with per-request registry isolation backed by `AsyncLocalStorage`.

---

## Setup

```ts
import { createStoreForRequest } from "stroid/server"
```

`stroid/server` uses Node's `async_hooks` module. It is Node-only — do not import in browser bundles.

---

## Basic Pattern

```ts
// app/api/render/route.ts  (Next.js App Router)
import { createStoreForRequest } from "stroid/server"
import { renderToString }        from "react-dom/server"

export async function GET(req: Request) {
  const session = await getSession(req)

  const stores = createStoreForRequest((api) => {
    api.create("user",  { name: session.user.name, role: session.user.role })
    api.create("cart",  { items: [] })
    api.create("flags", session.featureFlags)
  })

  // All store operations inside .hydrate() are scoped to this request.
  const html  = stores.hydrate(() => renderToString(<App />))
  const state = stores.snapshot()  // plain JSON object

  return Response.json({ html, state })
}
```

### Client: Rehydrate from Server Snapshot

```ts
import { hydrateStores } from "stroid"

hydrateStores(window.__STROID_STATE__, {}, { allowTrusted: true })
```

---

## `createStoreForRequest` API

### Callback argument: `api`

Inside the callback, `api` provides:

```ts
api.create(name, data, options?)   // create a store in the request scope
api.set(name, updater)             // write to a store
api.get(name)                      // read a store
api.snapshot()                     // get all stores as a plain object
```

### Return value: `stores`

```ts
stores.hydrate(fn)    // run fn inside the request scope; returns fn's return value
stores.snapshot()     // serialize all stores to a plain object for client hydration
```

---

## AsyncLocalStorage Isolation

Every `createStoreForRequest` call creates a new `StoreRegistry` and runs all operations inside that registry's `AsyncLocalStorage` context. Concurrent requests never share store values, subscribers, or metadata — even across async boundaries (awaits, etc.).

```ts
// Two concurrent requests — completely isolated:
const storesA = createStoreForRequest((api) => api.create("user", userA))
const storesB = createStoreForRequest((api) => api.create("user", userB))

// Both run concurrently with no cross-contamination.
storesA.hydrate(() => renderToString(<AppA />))
storesB.hydrate(() => renderToString(<AppB />))
```

---

## Typed SSR Stores

```ts
import type { StoreStateMap } from "stroid"
import { createStoreForRequest } from "stroid/server"

// Use the global StoreStateMap augmentation for typed api.create:
createStoreForRequest<StoreStateMap>((api) => {
  api.create("user", { name: "Ava", role: "admin" })  // typed
})
```

Or define a request-local type:

```ts
type RequestState = { user: UserState; cart: CartState }
createStoreForRequest<RequestState>((api) => { ... })
```

---

## Typed Snapshot Hydration

For stricter client-side typing:

```ts
import type { HydrateSnapshotFor, StoreStateMap } from "stroid"

hydrateStores<HydrateSnapshotFor<StoreStateMap>>(
  window.__STROID_STATE__,
  {},
  { allowTrusted: true }
)
```

---

## Hydration Trust and Validation

The third argument to `hydrateStores` is always required:

```ts
// Accept any snapshot unconditionally
hydrateStores(snapshot, {}, { allowTrusted: true })

// Validate before accepting
hydrateStores(snapshot, {}, {
  allowTrusted: true,
  validate: (s) => typeof s.user === "object",
  onValidationError: (err, snapshot) => {
    console.error("invalid snapshot", err)
    return false  // block hydration
  }
})
```

- In dev, a thrown `trust.validate` re-throws.
- In production, it routes via `onError` and `onValidationError`.

---

## Global SSR Stores (Rare)

For truly global state that persists across requests (e.g., feature flags loaded once at startup):

```ts
createStore("featureFlags", flags, { scope: "global" })
```

Stroid warns once in dev about SSR global stores. Use them only for data that is safe to share across concurrent requests.

`createStoreForRequest` sets `{ allowTrusted: true }` on its internal hydration calls.

---

## Production SSR Safeguard

In production Node environments, `createStore` without a request context **blocks by default** (returns `undefined`). This prevents accidental global store pollution:

```ts
// In production server — this is blocked:
createStore("user", data)  // → undefined, logs error

// Correct approach:
createStoreForRequest((api) => {
  api.create("user", data)
})
```
