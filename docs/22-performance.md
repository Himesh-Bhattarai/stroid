# Chapter 22 — Performance

> *"Fast by default. Faster when you need it."*

---

## The Golden Rule

```js
// ⚠️ Slow — re-renders on any user change
const user = useStore("user")

// ✅ Fast — re-renders only when name changes
const name = useStore("user.name")
```

Always read the most specific path you need.

---

## Batch Updates

Multiple updates that happen together should be batched:

```js
// ⚠️ Three re-renders
setStore("auth.user", user)
setStore("auth.token", token)
setStore("auth.isLoggedIn", true)

// ✅ One re-render
setStoreBatch([
  ["auth.user", user],
  ["auth.token", token],
  ["auth.isLoggedIn", true]
])
```

---

## Use useSelector For Derived Data

```js
// ⚠️ Recomputes on every render
function CartSummary() {
  const items = useStore("cart.items")
  const total = items.reduce((sum, item) => sum + item.price, 0)
}

// ✅ Memoized — only recomputes when items change
function CartSummary() {
  const total = useSelector(
    "cart",
    state => state.items.reduce((sum, item) => sum + item.price, 0)
  )
}
```

---

## Temp Stores Clean Up Automatically

```js
// ✅ Memory freed on unmount — no action needed
createStore("heavyUIState", { ... }, { isTemp: true })
```

---

## Bundle Size By Import

| Import | Size (gzip) |
|--------|------------|
| `stroid/core` only | ~3KB |
| `+ stroid/react` | ~4KB |
| `+ stroid/persist` | ~5.5KB |
| `+ stroid/sync` | ~6.5KB |
| Everything | ~8KB |

---

**[← Chapter 21 — Architecture](./21-architecture.md)** · **[Chapter 23 — Migration →](./23-migration.md)**