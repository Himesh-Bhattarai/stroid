# Chapter 8 — resetStore

> *"Every store remembers where it started."*

---

## Basic Usage

```js
import { resetStore } from "stroid/core"

// Reset entire store to initial state
resetStore("user")

// Reset a specific branch
resetStore("user.profile")
```

---

## How It Works

When you call `createStore`, stroid remembers the initial state. `resetStore` returns the store to exactly that state.

```js
createStore("counter", { count: 0, step: 1 })

setStore("counter.count", 42)
setStore("counter.step", 5)

resetStore("counter")
// Back to: { count: 0, step: 1 }
```

---

## Common Use Cases

```js
// Logout — reset auth state
async function logout() {
  await api.logout()
  resetStore("auth")
  resetStore("cart")
  resetStore("user")
}

// Form cancel — reset form
function handleCancel() {
  resetStore("checkoutForm")
  navigate("/cart")
}

// Game restart
function restartGame() {
  resetStore("game")
}
```

---

## Get Initial State

```js
import { getInitialState } from "stroid/core"

const initial = getInitialState("counter")
// { count: 0, step: 1 }
```

---

**[← Chapter 7 — getStore](./07-getStore.md)** · **[Chapter 9 — setStoreBatch →](./09-setStoreBatch.md)**