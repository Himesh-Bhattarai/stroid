# Chapter 18 -- SSR and RSC

> "Serialize once, hydrate on the client."

---

## Hydrating Stores

```js
import { hydrateStores } from "stroid"

const snapshot = {
  auth: { user: null, token: null },
  settings: { theme: "dark" }
}

hydrateStores(snapshot)
```

`hydrateStores` creates missing stores or updates existing ones using their options (persist, middleware, schema, etc.).

---

## With createStoreForRequest

```js
const req = createStoreForRequest(api => {
  api.create("config", await loadConfig())
})

const snapshot = req.snapshot()
// send snapshot to client
req.hydrate() // reuse on server if needed
```

Prepare request-scoped state, then hydrate on the client.

---

## SSR Safety Flags

`allowSSRGlobalStore` lets you opt in to creating stores in environments that lack `window` without dev warnings.

---

**[<- Chapter 17 -- Schema](./17-schema.md) :: [Chapter 19 -- Devtools ->](./19-devtools.md)**
