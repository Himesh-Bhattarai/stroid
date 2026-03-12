# Chapter 22 -- Performance

> "Fast by default. Faster when you need it."

---

## Read Narrowly

```js
// Broad subscription
const user = useStore("user")

// Precise subscription
const name = useStore("user", "name")
```

Subscribing to precise paths keeps React renders small.

---

## Batch Notifications

```js
setStoreBatch(() => {
  setStore("auth", "user", user)
  setStore("auth", "token", token)
  setStore("auth", "isLoggedIn", true)
})
```

`setStoreBatch` defers subscriber flush until the callback completes and commits writes atomically, reducing render churn and preventing intermediate state visibility.

---

## Derived Data With useSelector

```js
const total = useSelector(
  "cart",
  state => state.items.reduce((sum, item) => sum + item.price, 0)
)
```

`useSelector` memoizes and only re-runs when the selected slice changes (configurable equality).

---

## Mutator Clone Cost

```js
setStore("profile", draft => {
  draft.name = "Jordan"
})
```

Mutator writes deep-clone the entire store before applying the recipe. For large trees, prefer
`setStore(name, path, value)` or `setStore(name, partialObject)` so only the touched branch is cloned.

---

## Avoid Oversized Trees

- Split deep objects into multiple stores when paths exceed about 5 or 6 segments.
- Use `historyLimit` and `redactor` options to keep history and middleware work small.

---

## Async Cache Hits

`fetchStore` respects `ttl` and `staleWhileRevalidate`, so cached responses skip network and avoid extra renders. Inspect `getAsyncMetrics()` to see cache hits and misses.

---

**[<- Chapter 21 -- Architecture](./21-architecture.md) :: [Chapter 23 -- Migration ->](./23-migration.md)**
