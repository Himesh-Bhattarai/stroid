# Chapter 10 -- subscribeWithSelector

> "Watch only what matters. React only when it changes."

---

## Basic Usage

```js
import { subscribeWithSelector } from "stroid"

const unsubscribe = subscribeWithSelector(
  "user",                          // store name
  state => state.profile.name,     // selector -- what to watch
  Object.is,                       // equality check
  (name, prevName) => {            // callback -- what to do
    console.log(`Name changed: ${prevName} -> ${name}`)
  }
)

// Stop watching
unsubscribe()
```

---

## Only Fires On Actual Changes

The callback only fires when the selected value actually changes -- not on every store update.

```js
subscribeWithSelector(
  "user",
  state => state.theme,
  Object.is,
  (theme) => {
    document.body.setAttribute("data-theme", theme)
  }
)

setStore("user", "name", "Jo")     // callback NOT fired -- theme unchanged
setStore("user", "theme", "light") // callback fired -- theme changed
```

---

## Real World Uses

```js
// Sync theme to DOM
subscribeWithSelector(
  "user",
  s => s.theme,
  Object.is,
  theme => document.documentElement.setAttribute("data-theme", theme)
)

// Log auth changes
subscribeWithSelector(
  "auth",
  s => s.isLoggedIn,
  Object.is,
  (isLoggedIn) => {
    analytics.track(isLoggedIn ? "login" : "logout")
  }
)

// Save cart on change
subscribeWithSelector(
  "cart",
  s => s.items,
  Object.is,
  (items) => {
    api.saveCart(items).catch(console.error)
  }
)
```

The current signature is `subscribeWithSelector(name, selector, equalityFn, listener)`. Pass `Object.is` when the default identity comparison is enough.

---

**[<- Chapter 9 -- setStoreBatch](./09-setStoreBatch.md) :: [Chapter 11 -- createStoreForRequest ->](./11-createStoreForRequest.md)**
