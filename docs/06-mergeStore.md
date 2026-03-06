# Chapter 6 -- mergeStore

> "Drop in new object fields without paths."

---

## Basic Usage

```js
import { mergeStore } from "stroid"

mergeStore("user", { address: { city: "NYC" } })
```

`mergeStore` shallow-merges an object into an existing object store. It fails fast on non-object stores.

---

## When To Use

- Adding or updating several top-level keys at once.
- Preferring object spread semantics instead of dot-path updates.

`setStore("user", {...})` also merges, but `mergeStore` explicitly guards against non-object stores and keeps intent clear.

---

## Validation Pipeline

`mergeStore` still runs schema, validator, middleware, persistence, history, and devtools hooks just like `setStore`.

---

**[<- Chapter 5 -- setStore](./05-setStore.md) :: [Chapter 7 -- getStore ->](./07-getStore.md)**
