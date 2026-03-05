# Chapter 14 -- Persistence

> "State that survives refresh, configured in one place."

---

## Enable Per Store

```js
createStore("cart", { items: [] }, { persist: true })
```

`persist: true` uses `localStorage` if available; when unavailable, it falls back to an in-memory driver.

---

## Custom Configuration

```js
createStore("user", initial, {
  persist: {
    driver: sessionStorage,      // any storage-like object
    key: "stroid-user",
    serialize: JSON.stringify,
    deserialize: JSON.parse,
    encrypt: v => v,
    decrypt: v => v,
  }
})
```

- `driver` must expose `getItem/setItem/removeItem`.
- `key` defaults to the store name.
- `serialize/deserialize` let you control encoding.
- `encrypt/decrypt` let you wrap storage for secrecy.

---

## Collisions and Warnings

Stroid prevents two stores from sharing the same persist key and will warn if you try. Failed loads are ignored and the store resets to its initial value.

---

**[<- Chapter 13 -- Async](./13-async.md) :: [Chapter 15 -- Sync ->](./15-sync.md)**
