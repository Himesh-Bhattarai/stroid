# Chapter 10 — subscribeWithSelector

> *"Watch only what matters. React only when it changes."*

---

## Basic Usage

```js
import { subscribeWithSelector } from "stroid/core"

const unsubscribe = subscribeWithSelector(
  "user",                          // store name
  state => state.profile.name,     // selector — what to watch
  (name, prevName) => {            // callback — what to do
    console.log(`Name changed: ${prevName} → ${name}`)
  }
)

// Stop watching
unsubscribe()
```

---

## Only Fires On Actual Changes

The callback only fires when the selected value actually changes — not on every store update.

```js
subscribeWithSelector(
  "user",
  state => state.theme,
  (theme) => {
    document.body.setAttribute("data-theme", theme)
  }
)

setStore("user.name", "Jo")    // callback NOT fired — theme unchanged
setStore("user.theme", "light") // callback fired — theme changed
```

---

## Real World Uses

```js
// Sync theme to DOM
subscribeWithSelector(
  "user",
  s => s.theme,
  theme => document.documentElement.setAttribute("data-theme", theme)
)

// Log auth changes
subscribeWithSelector(
  "auth",
  s => s.isLoggedIn,
  (isLoggedIn) => {
    analytics.track(isLoggedIn ? "login" : "logout")
  }
)

// Save cart on change
subscribeWithSelector(
  "cart",
  s => s.items,
  (items) => {
    api.saveCart(items).catch(console.error)
  }
)
```

---

**[← Chapter 9 — setStoreBatch](./09-setStoreBatch.md)** · **[Chapter 11 — createStoreForRequest →](./11-createStoreForRequest.md)**