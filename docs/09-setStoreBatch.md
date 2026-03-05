# Chapter 9 — setStoreBatch

> *"Multiple updates. One notification. Zero intermediate renders."*

---

## Basic Usage

```js
import { setStoreBatch } from "stroid/core"

setStoreBatch([
  ["user.name", "Jo"],
  ["user.theme", "light"],
  ["app.loading", false]
])
```

All updates apply atomically. Components re-render once — after all updates are applied.

---

## Why It Matters

```js
// Without batch — 3 separate re-renders
setStore("app.loading", false)    // re-render 1
setStore("user.name", "Jo")       // re-render 2
setStore("cart.total", 0)         // re-render 3

// With batch — 1 re-render
setStoreBatch([
  ["app.loading", false],
  ["user.name", "Jo"],
  ["cart.total", 0]
])
// re-render 1 — after all three are applied
```

---

## Real World — After API Response

```js
async function handleLoginSuccess(userData) {
  setStoreBatch([
    ["auth.user", userData],
    ["auth.token", userData.token],
    ["auth.isLoggedIn", true],
    ["auth.isLoading", false],
    ["app.lastLogin", Date.now()]
  ])
}
```

---

## Across Multiple Stores

```js
// Batch works across different stores
setStoreBatch([
  ["auth.isLoggedIn", false],
  ["cart.items", []],
  ["cart.total", 0],
  ["user.profile", null]
])
```

---

## With .replace

```js
setStoreBatch([
  ["user.name", "Jo"],                                    // merge
  [["cart", { items: [], total: 0 }, "replace"]],        // replace
])
```

---

**[← Chapter 8 — resetStore](./08-resetStore.md)** · **[Chapter 10 — subscribeWithSelector →](./10-subscribeWithSelector.md)**