# Runtime Tools & Devtools

> **Confidence: HIGH** — derived from `src/runtime-tools/index.ts`, `src/devtools/api.ts`, `src/devtools/index.ts`.

---

## Runtime Tools (`stroid/runtime-tools`)

No setup required. Import directly.

```ts
import {
  listStores,
  getStoreMeta,
  getMetrics,
  getSubscriberCount,
  getAsyncInflightCount,
  getStoreHealth,
  findColdStores,
  getPersistQueueDepth,
  getComputedGraph,
  getComputedDeps,
} from "stroid/runtime-tools"
```

### `listStores(pattern?)`

```ts
listStores()           // → ["user", "cart", "settings", "cartTotal"]
listStores("cart*")    // → ["cart", "cartTotal"]
```

Wildcard `"prefix*"` is supported.

### `getStoreMeta(name)`

Returns shallow-cloned metadata for a store:

```ts
getStoreMeta("cart")
// {
//   createdAt:    "2026-03-18T10:00:00Z",
//   updatedAt:    "2026-03-18T10:01:00Z",
//   updatedAtMs:  1742291260000,
//   updateCount:  42,
//   readCount:    100,
//   lastReadAt:   "...",
//   metrics:      { notifyCount, totalNotifyMs, lastNotifyMs },
//   options:      { ... normalized options ... },
// }
```

### `getMetrics(name)`

Notification timing for a store:

```ts
getMetrics("cart")
// { notifyCount: 42, totalNotifyMs: 8.3, lastNotifyMs: 0.2 }
```

Returns `null` if the store does not exist.

### `getSubscriberCount(name)`

Number of active subscriber callbacks (React hooks, manual subscriptions).

### `getAsyncInflightCount(name)`

Number of in-flight async fetch slots for a store.

### `getPersistQueueDepth(name)`

Number of pending writes waiting to be flushed to storage.

### `getStoreHealth(name?)`

Full observability report — per-store or global:

```ts
// Single store
getStoreHealth("cart")
// {
//   name: "cart",
//   meta: { ... },
//   metrics: { notifyCount, ... },
//   async: { inflight: 0, lastCorrelationId: null, traceContext: null },
//   persist: { queueDepth: 0 },
// }

// Full registry
getStoreHealth()
// {
//   stores: [StoreHealthEntry, ...],
//   async: { totalRequests, ... },
//   registry: { totalStores: 8, coldStores: [...] },
// }
```

### `findColdStores(options?)`

Surfaces potentially unused stores:

```ts
findColdStores({
  unreadThresholdMs: 60_000,   // default
  includeWriteOnly:  true,
})
// → ColdStoreReport[] with verdict: "cold" | "write-only" | "stale"
```

Useful for finding dead code or memory leaks in long-running apps.

### `getComputedGraph()`

```ts
getComputedGraph()
// { nodes: ["cartTotal"], edges: [{ from: "cart", to: "cartTotal" }] }
```

### `getComputedDeps(name)`

```ts
getComputedDeps("cartTotal")  // → ["cart", "discount"]
```

---

## Runtime Admin (`stroid/runtime-admin`)

Destructive operations. Use with care — primarily for test teardown or app-level reset flows.

```ts
import { clearAllStores, clearStores } from "stroid/runtime-admin"

clearAllStores()            // remove all stores + reset async state + clear path cache
clearStores("session*")     // remove stores matching prefix
```

---

## Devtools (`stroid/devtools`)

### Setup

```ts
// main.tsx — once at app entry
import "stroid/devtools"
```

This registers the devtools feature. Stores with `devtools: true` (or `devtools: { historyLimit, redactor }`) will record write history.

### Enable on a Store

```ts
createStore("cart", { items: [] }, {
  devtools: {
    historyLimit: 100,                  // default: 50
    redactor: (state) => ({             // strip sensitive fields from history
      ...state,
      paymentToken: "[REDACTED]",
    }),
  }
})
```

Or as a boolean:

```ts
createStore("cart", { items: [] }, { devtools: true })
```

### `getHistory(name)`

```ts
import { getHistory } from "stroid/devtools"

getHistory("cart")
// [
//   { prev: { items: [] }, next: { items: [{ id: "1" }] }, action: "set", timestamp: "..." },
//   ...
// ]
```

### `clearHistory(name)`

```ts
import { clearHistory } from "stroid/devtools"

clearHistory("cart")
```

### Redux DevTools

> **Note on Redux DevTools integration:** The existing docs reference Redux DevTools integration (time-travel, action replay). This cannot be confirmed from the source code in this repository. The `devtools` feature records history in-memory and exposes it via `getHistory`, but no Redux DevTools bridge is present in the source. Treat Redux DevTools integration as **unverified — derived from documentation, not confirmed in code**.

---

## Log Routing

Route stroid's internal logs to your observability platform:

```ts
configureStroid({
  logSink: {
    log:      (msg, meta) => logger.info(msg, meta),
    warn:     (msg, meta) => logger.warn(msg, meta),
    critical: (msg, meta) => logger.error(msg, meta),
  }
})
```

All internal `warn(...)`, `error(...)`, and `log(...)` calls use this sink.
