# Chapter 7 -- getStore

> "Read state anywhere. Not just in React."

---

## Basic Usage

```js
import { getStore } from "stroid"

// Read entire store
const user = getStore("user")

// Read specific field
const name = getStore("user", "name")

// Read nested field
const city = getStore("user", "address.city")
```

---

## Outside React

`getStore` is the way to read state outside of React components -- in utilities, services, event handlers, or async functions.

```js
// In an API service
async function updateProfile(data) {
  const token = getStore("auth", "token")
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
// Snapshot -- value at this moment
const name = getStore("user", "name")

// Reactive -- re-renders on change
const name = useStore("user", "name")
```

--- 

## TypeScript

```ts
const userStore = createStore("user", { name: "Eli", score: 0 })
if (!userStore) throw new Error("failed to create user store")

// Passing the returned StoreDefinition gives typed core APIs
const user = getStore(userStore)          // { name: string; score: number } | null
const name = getStore(userStore, "name")  // string | null
const score = getStore(userStore, "score") // number | null
```

String-name reads still work at runtime. The typed overloads come from passing the `StoreDefinition` returned by `createStore`.

---

**[<- Chapter 5 -- setStore](./05-setStore.md) :: [Chapter 8 -- resetStore ->](./08-resetStore.md)**
