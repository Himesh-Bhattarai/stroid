# Chapter 13 -- Async

> "Async is just state that arrives later."

---

## API

```js
import { fetchStore, refetchStore, enableRevalidateOnFocus } from "stroid/async"
```

`fetchStore` drives a store with `{ data, loading, error, status, cached? }`.

---

## Basic Usage

```js
await fetchStore("products", "/api/products", {
  ttl: 30000,           // cache for 30s
  staleWhileRevalidate: true,
  dedupe: true,         // avoid duplicate in-flight
  retry: 2,             // retries on failure
})
```

If the store does not exist, it is created automatically with the async shape.

---

## Inflight Limits

Each store enforces a hard limit of 100 concurrent inflight requests (across unique cache keys). If you exceed the limit, `fetchStore` throws and triggers `onError`:

```js
try {
  await fetchStore("burst", "/api/burst", { cacheKey: "slot-101" })
} catch (err) {
  // handle overload
}
```

---

## React Consumption

```js
import { useStore } from "stroid/react"

function Products() {
  const { data, loading, error } = useStore("products") ?? {}
  if (loading) return <Spinner />
  if (error) return <p>Error: {error}</p>
  return data?.map(p => <div key={p.id}>{p.name}</div>)
}
```

---

## Refetch and Focus Revalidation

```js
refetchStore("products")              // manual refetch
enableRevalidateOnFocus()             // revalidate all registered async stores
enableRevalidateOnFocus("products")   // or just one store
```

`refetchStore(name)` reuses the last URL/promise and options registered through `fetchStore(name, ...)`.

---

## Metrics

```js
import { getAsyncMetrics } from "stroid/async"
const { cacheHits, cacheMisses, requests, failures, lastMs } = getAsyncMetrics()
```

Use this to observe cache effectiveness during development.

---

**[<- Chapter 12 -- React Bindings](./12-react.md) :: [Chapter 14 -- Persistence ->](./14-persist.md)**
