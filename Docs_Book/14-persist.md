# Chapter 14 — Persistence

> *"State that survives a refresh. Zero wiring."*

---

## Import

```js
import { persist } from "stroid/persist"
```

---

## Basic Usage

```js
persist("cart")
// cart now survives page refresh automatically
```

Call `persist` after `createStore`. That's it.

---

## With Options

```js
persist("user", {
  storage: "localStorage",    // default
  storage: "sessionStorage",  // clears on tab close
  key: "stroid-user",         // custom storage key
  include: ["name", "theme"], // only persist these fields
  exclude: ["token"],         // persist everything except these
})
```

---

## Custom Storage Adapter

```js
persist("user", {
  storage: {
    getItem: (key) => myCustomStorage.get(key),
    setItem: (key, value) => myCustomStorage.set(key, value),
    removeItem: (key) => myCustomStorage.delete(key)
  }
})
```

Works with IndexedDB, AsyncStorage (React Native), or any key-value store.

---

## Migrations

When your store schema changes, migrate old persisted data:

```js
persist("user", {
  version: 2,
  migrations: {
    1: (state) => ({
      ...state,
      // v1 had "fullName", v2 splits it
      firstName: state.fullName.split(" ")[0],
      lastName: state.fullName.split(" ")[1],
      fullName: undefined
    })
  }
})
```

Stroid automatically runs the right migrations when loading persisted data.

---

## Hydration

```js
import { hydrateStores } from "stroid/ssr"

// On app start — load all persisted stores
await hydrateStores()
```

---

**[← Chapter 13 — Async](./13-async.md)** · **[Chapter 15 — Sync →](./15-sync.md)**