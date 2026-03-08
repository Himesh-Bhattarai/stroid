# Chapter 23 -- Migration Guide

---

## From Earlier Docs To v0.0.4

- `setStore.replace`: not implemented. Replace branches by passing the full value to `setStore`.
- Array batching: `setStoreBatch` only accepts a callback; move tuple batches inside a function.
- `isGlobal` / `isTemp` options: not present. Manage lifetime manually (`deleteStore`, `clearAllStores`).
- External `persist/sync/middleware/schema` packages: configure these via `createStore` options instead.
- `deleteStore`: still available; no removal required.
- Draft mutators: still supported (`setStore(name, draft => {...})`); keep using them if you prefer.
- Testing: use `stroid/testing` helpers instead of `stroid-test`.
- Devtools: enable with `{ devtools: true }`; no separate `stroid-devtools` package.
- Path APIs pass the store name and path separately: `setStore("user", "name", "Jo")`, `getStore("user", "name")`, `useStore("user", "name")`.

---

## From Redux or another state library

```js
// Redux -> Stroid
createStore("user", { name: "Eli" })
setStore("user", "name", "Jo")

// Another store -> Stroid
createStore("user", { name: "Eli" })
const name = useStore("user", "name")
```

---

**[<- Chapter 22 -- Performance](./22-performance.md) :: [Chapter 24 -- Roadmap ->](./24-roadmap.md)**
