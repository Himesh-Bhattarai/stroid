# Chapter 11 -- createStoreForRequest

> "Build state during a request, then hydrate it in one shot."

---

## What It Does

`createStoreForRequest` gives you an in-memory buffer to collect store data (without touching the global store registry) and a `hydrate` helper to replay that buffer into real stores later.

This is useful for SSR/RSC or any per-request work where you need to prepare state but only commit once the request finishes.

---

## API

```ts
const req = createStoreForRequest((api) => {
  api.create("profile", { name: "Eli" })
  api.set("profile", state => ({ ...state, loadedAt: Date.now() }))
})

const snapshot = req.snapshot() // plain object of buffered stores
req.hydrate()                   // creates/updates real stores from the buffer
```

- `create(name, data, options?)` adds a buffered store.
- `set(name, updater)` mutates the buffered value (function or value).
- `get(name)` returns a clone of buffered data.
- `snapshot()` returns all buffered stores.
- `hydrate(options?)` calls `hydrateStores` to create or update real stores with the buffered data.

No network fetching is performed; pair this with your own fetches or with `fetchStore` from the async API.

---

**[<- Chapter 10 -- subscribeWithSelector](./10-subscribeWithSelector.md) :: [Chapter 12 -- React Bindings ->](./12-react.md)**
