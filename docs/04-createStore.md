# Chapter 4 -- createStore

> "A store is data plus rules for how that data lives."

---

## Basic Usage

```js
import { createStore } from "stroid"

createStore("counter", { count: 0 })
```

Returns `{ name: "counter" }` for type inference; the store is ready immediately.

---

## Options (v0.0.4)

```js
createStore("user", initialState, {
  persist: true | "localStorage" | "sessionStorage" | PersistConfig,
  devtools: true,
  middleware: [fn],
  onSet: (prev, next) => {},
  onReset: (prev, next) => {},
  onDelete: prev => {},
  onCreate: initial => {},
  onError: msg => {},
  validator: next => boolean,
  schema: zodSchema | yupSchema | (value) => value | boolean,
  migrations: { [version]: state => state },
  version: number,
  redactor: state => state,
  historyLimit: number,
  allowSSRGlobalStore: boolean,
  sync: true | {
    channel?: string,
    maxPayloadBytes?: number,
    conflictResolver?: (args) => unknown,
  },
})
```

- persist: enables persistence using localStorage/sessionStorage or a custom driver.
  The normalized config also supports `key`, `serialize`, `deserialize`, `encrypt`, `decrypt`, `onMigrationFail`, and `onStorageCleared`.
- devtools: wires Redux DevTools automatically.
- middleware: functions receive `{ action, name, prev, next, path }` and may return a modified `next`.
- schema/validator: block invalid updates before commit.
- migrations/version: run when persisted data loads.
- sync: cross-tab BroadcastChannel sync with optional channel name, payload limit, and conflict resolver.
- historyLimit: controls action history retained for `getHistory`.

---

## Examples

```js
// Persisted, devtools-enabled store
createStore("auth", { user: null }, { persist: true, devtools: true })

// Schema + middleware
createStore("settings", { theme: "dark" }, {
  schema: v => typeof v.theme === "string" || false,
  middleware: [
    ({ next }) => ({ ...next, updatedAt: Date.now() }),
  ],
})

// Capture the returned definition when you want typed core calls later
const userStore = createStore("user", { name: "Eli", score: 0 })
if (userStore) {
  setStore(userStore, "score", 1)
  const score = getStore(userStore, "score")
}
```

---

## Helper Factories

Stroid ships a few helpers for common patterns:

- `createCounterStore(name, initial = 0, options?)` -> { inc, dec, set, reset, get }
- `createListStore(name, initialArray = [], options?)` -> { push, removeAt, clear, replace, all }
- `createEntityStore(name, options?)` -> { upsert, remove, all, get, clear }
- `createSelector(storeName, selectorFn)` from `stroid/selectors` -> memoized selector you can call without React
- `subscribeWithSelector(name, selector, equalityFn, listener)` from `stroid/selectors` -> watch a derived value outside React

Factory helpers are exported from `stroid/helpers` and selector helpers from `stroid/selectors`.

---

## Introspection and Cleanup

- `getStoreMeta(name)` -> options and metrics
- `getHistory(name, limit?)` and `clearHistory(name?)` from `stroid/devtools`
- `getMetrics(name)` -> subscriber timing stats
- `listStores()` and `hasStore(name)`
- `clearAllStores()` and `deleteStore(name)`

Use these for debugging tools, tests, or app-level cleanup.

---

## Naming Rules

- Non-empty string, no spaces.
- Avoid extremely deep shapes (path depth > 10 is blocked).

---

**[<- Chapter 3 -- Core Philosophy](./03-core-philosophy.md) :: [Chapter 5 -- setStore ->](./05-setStore.md)**
