# Chapter 9 -- setStoreBatch

> "Multiple updates. One notification. Zero extra renders."

---

## API

```js
import { setStoreBatch, setStore } from "stroid"

setStoreBatch(() => {
  setStore("user", "name", "Jo")
  setStore("user", "theme", "light")
  setStore("app", "loading", false)
})
```

`setStoreBatch` suspends subscriber notifications until the callback finishes, then flushes once. In `v0.0.5`, the batch is **transactional**: writes are staged and only committed if the entire callback succeeds. There is no array/tuple overload in v0.0.4.

---

## When To Use It

- Multiple related updates that should render once (forms, login flows).
- Coordinating updates across several stores.
- Wrapping loops that call `setStore` many times.

---

## Notes

- The batch is transactional: if any write fails or the callback throws, **nothing commits** and **no notifications** are flushed.
- `setStoreBatch` still runs validation/middleware per `setStore` call while staging.
- `createStore`, `deleteStore`, and `hydrateStores` are not allowed inside `setStoreBatch` (they break transaction semantics). Move them outside the batch.

---

**[<- Chapter 8 -- resetStore](./08-resetStore.md) :: [Chapter 10 -- subscribeWithSelector ->](./10-subscribeWithSelector.md)**
