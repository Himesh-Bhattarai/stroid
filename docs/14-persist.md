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
    onMigrationFail: "reset",    // or "keep" or a recovery function
    onStorageCleared: info => {
      console.warn(`${info.name} storage key disappeared: ${info.reason}`)
    },
  }
})
```

- `driver` must expose `getItem/setItem/removeItem`.
- `key` defaults to `stroid_${name}`.
- `serialize/deserialize` let you control encoding.
- `encrypt/decrypt` let you wrap storage for secrecy.
- `onMigrationFail` controls how persisted version/schema recovery behaves.
- `onStorageCleared` fires when a previously present key disappears.

---

## Collisions and Warnings

Stroid warns when two stores share the same persist key, but it does not hard-block the collision. A later store can overwrite the same storage entry.

Checksum, decrypt, and load failures report through `onError`. Version/schema mismatches can recover through `onMigrationFail`; otherwise Stroid falls back to the initial state.

---

**[<- Chapter 13 -- Async](./13-async.md) :: [Chapter 15 -- Sync ->](./15-sync.md)**
