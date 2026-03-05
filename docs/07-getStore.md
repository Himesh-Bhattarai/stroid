# Chapter 7 — getStore

> *"Read state anywhere. Not just in React."*

---

## Basic Usage

```js
import { getStore } from "stroid/core"

// Read entire store
const user = getStore("user")

// Read specific field
const name = getStore("user.name")

// Read nested field
const city = getStore("user.address.city")
```

---

## Outside React

`getStore` is the way to read state outside of React components — in utilities, services, event handlers, or async functions.

```js
// In an API service
async function updateProfile(data) {
  const token = getStore("auth.token")
  return fetch("/api/profile", {
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data)
  })
}

// In a utility function
function formatUserDisplay() {
  const { name, role } = getStore("user")
  return role === "admin" ? `${name} (Admin)` : name
}

// In an event handler
window.addEventListener("beforeunload", () => {
  const cart = getStore("cart")
  localStorage.setItem("cart-backup", JSON.stringify(cart))
})
```

---

## Returns A Snapshot

`getStore` returns the current state at the moment of the call. It does not subscribe to changes. For reactive reads in React, use `useStore`.

```js
// Snapshot — value at this moment
const name = getStore("user.name")

// Reactive — re-renders on change
const name = useStore("user.name")
```

---

## TypeScript

```ts
// Full type inference
const user = getStore("user")        // inferred as UserState
const name = getStore("user.name")   // inferred as string
const score = getStore("user.score") // inferred as number
```

---

**[← Chapter 6 — mergeStore](./06-mergeStore.md)** · **[Chapter 8 — resetStore →](./08-resetStore.md)**