# Chapter 9 -- setStoreBatch

> "Multiple updates. One notification. Zero extra renders."

---

## API

```js
import { setStoreBatch, setStore } from "stroid"

setStoreBatch(() => {
  setStore("user.name", "Jo")
  setStore("user.theme", "light")
  setStore("app.loading", false)
})
```

`setStoreBatch` suspends subscriber notifications until the callback finishes, then flushes once. There is no array/tuple overload in v0.0.3.

---

## When To Use It

- Multiple related updates that should render once (forms, login flows).
- Coordinating updates across several stores.
- Wrapping loops that call `setStore` many times.

---

## Notes

- If your callback throws, the batch flag is cleared in `finally`, and pending notifications still flush.
- `setStoreBatch` does not start a transaction; each `setStore` still runs validation, middleware, schema, and history.

---

**[<- Chapter 8 -- resetStore](./08-resetStore.md) :: [Chapter 10 -- subscribeWithSelector ->](./10-subscribeWithSelector.md)**
