# Chapter 8 -- resetStore

> "Every store remembers where it started."

---

## Basic Usage

```js
import { resetStore } from "stroid"

resetStore("user") // restores the store to its initial value
```

`resetStore` operates on the whole store. Branch resets are not supported in v0.0.3.

---

## How It Works

The value you pass to `createStore` is stored as the initial snapshot. `resetStore` deep-clones that snapshot and replaces the current value, then notifies subscribers.

```js
createStore("counter", { count: 0, step: 1 })
setStore("counter.count", 42)
resetStore("counter") // { count: 0, step: 1 }
```

---

## Common Use Cases

```js
async function logout() {
  resetStore("auth")
  resetStore("cart")
}

function handleCancel() {
  resetStore("checkoutForm")
}
```

---

## Initial Snapshot Utility

```js
import { getInitialState } from "stroid"

const snapshot = getInitialState() // all current stores cloned
```

`getInitialState()` returns a clone of every store's current value (useful for debugging or SSR), not a per-store getter.

---

**[<- Chapter 7 -- getStore](./07-getStore.md) :: [Chapter 9 -- setStoreBatch ->](./09-setStoreBatch.md)**
