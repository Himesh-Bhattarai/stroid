# Computed Stores

> **Confidence: HIGH** — derived from `src/computed/index.ts`, `src/computed/computed-graph.ts`.

---

## What Is a Computed Store?

A computed store is a regular store whose value is automatically derived from one or more dependency stores. When any dependency changes, the compute function re-runs and the computed store updates.

Under the hood, a computed store is just a store managed by `replaceStore`. You can read it with `getStore`, subscribe to it with `useStore`, and chain it as a dependency for other computed stores.

---

## Setup

```ts
import { createComputed } from "stroid/computed"
```

No side-effect import required.

---

## Basic Usage

```ts
import { createStore } from "stroid"
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

// cartTotal is now a regular store:
getStore("cartTotal")    // → computed value
useStore("cartTotal")    // → reactive in React
```

---

## Dependencies

Dependencies can be store names (strings) or `StoreDefinition` / `StoreKey` handles:

```ts
const cartStore = store<"cart", CartState>("cart")

createComputed(
  "cartTotal",
  [cartStore, "discount"],     // mix of handle and string
  (cart, discount) => { ... }
)
```

Missing dependencies receive `null` until the dependency store is created. A dev warning is emitted at registration time if a dependency is missing.

---

## Cycle Detection

Circular dependencies are detected at registration time and cause `createComputed` to return `undefined` with a warning.

---

## Flush Ordering

When multiple computed stores depend on each other, the notification pipeline topologically sorts the flush order so dependents always receive updated values in the correct order.

---

## Skipping No-Op Updates

If the compute function returns a value that is `Object.is` equal to the previous computed value, the store is not updated and subscribers are not notified.

---

## Error Handling

```ts
createComputed(
  "cartTotal",
  ["cart", "discount"],
  (cart, discount) => { ... },
  {
    onError: (err) => {
      console.error("compute failed", err)
      Sentry.captureException(err)
    }
  }
)
```

If the compute function throws, the store retains its previous value. `onError` is called if provided.

---

## `invalidateComputed(name)`

Forces an immediate re-run of the compute function, regardless of whether dependencies have changed.

```ts
import { invalidateComputed } from "stroid/computed"

invalidateComputed("cartTotal")
```

---

## `deleteComputed(name)`

Unsubscribes from all dependency stores and removes the computed store.

```ts
import { deleteComputed } from "stroid/computed"

deleteComputed("cartTotal")
```

---

## `isComputedStore(name)`

Returns `true` if the name belongs to a computed store.

---

## Observability

```ts
import { getComputedGraph, getComputedDeps } from "stroid/runtime-tools"

getComputedGraph()
// { nodes: ["cartTotal"], edges: [{ from: "cart", to: "cartTotal" }, { from: "discount", to: "cartTotal" }] }

getComputedDeps("cartTotal")
// ["cart", "discount"]
```
