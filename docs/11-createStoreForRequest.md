# Chapter 11 — createStoreForRequest

> *"Async state is still state. It deserves the same first-class treatment."*

---

## Basic Usage

```js
import { createStoreForRequest } from "stroid/core"

createStoreForRequest("fetchUser", async () => {
  const response = await fetch("/api/user")
  return response.json()
})
```

This creates a store with built-in `data`, `loading`, `error`, and `refetch` — automatically.

---

## In React

```js
import { useStore } from "stroid/react"

function UserProfile() {
  const { data, loading, error, refetch } = useStore("fetchUser")

  if (loading) return <Spinner />
  if (error) return <Error message={error} />

  return (
    <div>
      <h1>{data.name}</h1>
      <button onClick={refetch}>Refresh</button>
    </div>
  )
}
```

---

## The State Shape

Every request store has the same shape:

```js
{
  data: null,        // the response data
  loading: false,    // is request in flight
  error: null,       // error message if failed
  refetch: fn        // trigger a new request
}
```

---

## With Options

```js
createStoreForRequest("fetchProducts", async () => {
  return api.getProducts()
}, {
  ttl: 60000,           // cache for 60 seconds
  retries: 3,           // retry on failure
  dedupe: true,         // deduplicate in-flight requests
  revalidateOnFocus: true,  // refetch when tab regains focus
  revalidateOnReconnect: true  // refetch when back online
})
```

---

## With Parameters

```js
createStoreForRequest("fetchUser", async (userId) => {
  return api.getUser(userId)
})

// Trigger with params
refetchStore("fetchUser", userId)
```

---

## Abort Signal

```js
createStoreForRequest("fetchData", async (_, signal) => {
  const response = await fetch("/api/data", { signal })
  return response.json()
})
// Request automatically aborted if store is destroyed
// or a new request starts before this one finishes
```

---

**[← Chapter 10 — subscribeWithSelector](./10-subscribeWithSelector.md)** · **[Chapter 12 — React Bindings →](./12-react.md)**