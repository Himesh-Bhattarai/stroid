# Async Layer Guide

> **Confidence: HIGH** — derived from `src/async/fetch.ts`, `src/async/cache.ts`, `src/react/hooks-async.ts`.

---

## Setup

```ts
import { fetchStore, refetchStore, enableRevalidateOnFocus } from "stroid/async"
```

No side-effect import is required for `stroid/async` — it is a regular module (unlike `stroid/persist`, `stroid/sync`, and `stroid/devtools`).

---

## How It Works

`fetchStore` writes async lifecycle state into a named store. Your components read from that store via `useStore` or `useAsyncStore` — no state machine, no separate hook for async state.

The store must exist before `fetchStore` is called. The expected shape:

```ts
createStore("user", {
  data:    null,
  loading: false,
  error:   null,
  status:  "idle",
})
```

`fetchStore` then manages these fields automatically.

---

## Basic Usage

```ts
fetchStore("user", "/api/user", {
  ttl:    30_000,   // cache for 30 seconds
  dedupe: true,     // concurrent calls share one request
})
```

Reading the state in a component:

```tsx
import { useAsyncStore } from "stroid/react"

function UserCard() {
  const { data, loading, error, isEmpty } = useAsyncStore("user")
  if (loading) return <Spinner />
  if (error)   return <Error msg={error} />
  if (isEmpty) return <Empty />
  return <div>{data.name}</div>
}
```

---

## `fetchStore` Options

```ts
fetchStore("user", "/api/user", {
  // Caching
  ttl:                  30_000,     // ms; how long before data is stale
  staleWhileRevalidate: true,       // show stale data while refetching in background

  // Request
  method:   "GET",
  headers:  { Authorization: `Bearer ${token}` },
  body:     JSON.stringify(payload),
  signal:   controller.signal,      // AbortController signal

  // Response handling
  transform: (res) => res.data,    // shape the response before writing
  onSuccess: (data) => console.log(data),
  onError:   (err)  => Sentry.captureException(err),

  // Reliability
  retry:        3,
  retryDelay:   400,          // ms
  dedupe:       true,         // default: true; concurrent calls share one inflight request

  // State adapter (custom state update instead of default write)
  stateAdapter: ({ name, prev, next, set }) => {
    set({ ...prev, data: next.data, loading: false })
  },
})
```

### Input types

`urlOrRequest` can be:
- A URL string: `"/api/user"`
- A Promise: `fetch("/api/user")`
- A factory: `() => fetch("/api/user")`

---

## Stale-While-Revalidate

```ts
fetchStore("posts", "/api/posts", {
  ttl:                  60_000,
  staleWhileRevalidate: true,
})
```

On subsequent calls within the TTL window, the cached data is returned immediately. If `staleWhileRevalidate: true`, stroid re-fetches in the background and updates the store when done. While revalidating, `revalidating: true` is set in the store.

---

## Abort Control

```ts
const controller = new AbortController()

fetchStore("search", `/api/search?q=${query}`, {
  signal: controller.signal,
})

// Cancel the request:
controller.abort()
// Store is updated with { status: "aborted", error: "aborted" }
```

---

## `refetchStore`

Forces a re-fetch, bypassing the TTL cache.

```ts
refetchStore("user")
refetchStore("user", { onSuccess: data => console.log(data) })
```

---

## `enableRevalidateOnFocus`

Triggers `refetchStore` whenever the page regains focus or comes back online.

```ts
enableRevalidateOnFocus("user", "/api/user", {
  ttl:    30_000,
  dedupe: true,
})
```

Configured globally via `configureStroid({ revalidateOnFocus: { debounceMs, maxConcurrent, staggerMs } })`.

Listeners are automatically removed when the store is deleted.

---

## `useAsyncStoreSuspense`

For React Suspense integration. Throws a promise while loading; resolves to the `data` field.

```tsx
// Must be inside React.Suspense
const user = useAsyncStoreSuspense("user", "/api/user", { ttl: 30_000 })
```

Reuses in-flight promises — concurrent renders do not duplicate requests.

---

## Limits and Safeguards

- **Inflight slots**: Up to 100 concurrent inflight slots per store. Exceeding this throws.
- **Cache slots**: Up to 100 cached entries per store.
- **Rate limiting**: Built-in per-store rate limiter (metadata pruned on store deletion).
- **Deduplication**: Concurrent `fetchStore` calls for the same store share one request by default.
- **Auto-create**: By default, `fetchStore` warns in dev when the target store does not exist. Set `configureStroid({ asyncAutoCreate: true })` to create missing stores automatically.
- **Non-async stores**: `fetchStore` refuses to write to stores that don't match the expected async shape, unless a `stateAdapter` is provided.

---

## Correlation IDs and Tracing

```ts
configureStroid({ autoCorrelationIds: true })
```

When enabled, each `fetchStore` call attaches a correlation ID and optional trace context to the write. These are visible in `getStoreHealth(name).async.lastCorrelationId`.
