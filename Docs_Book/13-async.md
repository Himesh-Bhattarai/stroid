# Chapter 13 — Async

> *"Async is not special. It's just state that arrives later."*

---

## Import

```js
import { createQuery } from "stroid/async"
```

---

## The Pattern

Every async operation has the same shape in stroid:

```js
{
  data: null,      // response
  loading: false,  // in flight
  error: null,     // failed
  refetch: fn      // retry
}
```

---

## createQuery

```js
createQuery("products", async () => {
  const res = await fetch("/api/products")
  return res.json()
}, {
  ttl: 30000,              // cache 30 seconds
  retries: 2,              // retry twice on failure
  dedupe: true,            // no duplicate requests
  revalidateOnFocus: true  // refresh when tab focused
})
```

## In Components

```js
function Products() {
  const { data, loading, error, refetch } = useStore("products")

  if (loading) return <Spinner />
  if (error) return <p>Error: {error}</p>

  return (
    <>
      {data.map(p => <ProductCard key={p.id} product={p} />)}
      <button onClick={refetch}>Reload</button>
    </>
  )
}
```

---

**[← Chapter 12 — React Bindings](./12-react.md)** · **[Chapter 14 — Persistence →](./14-persist.md)**