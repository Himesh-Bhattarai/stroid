# Chapter 5 — setStore

> *"Update state by saying what you want, not how to get there."*

---

## Basic Usage

```js
import { setStore } from "stroid/core"

setStore(path, value)
setStore.replace(path, value)
```

Two shapes. One for merging. One for replacing.

---

## Default — Shallow Merge

```js
createStore("user", {
  name: "Eli",
  theme: "dark",
  score: 100
})

// Only name changes. theme and score untouched.
setStore("user", { name: "Jo" })

// Result: { name: "Jo", theme: "dark", score: 100 }
```

Stroid never destroys data you didn't mention. Safe by default.

---

## Dot-Path Updates — Surgical Nested

```js
createStore("user", {
  profile: {
    name: "Eli",
    avatar: "eli.png"
  },
  settings: {
    theme: "dark",
    notifications: true
  }
})

// Only profile.name changes. Everything else untouched.
setStore("user.profile.name", "Jo")

// Result:
// {
//   profile: { name: "Jo", avatar: "eli.png" },
//   settings: { theme: "dark", notifications: true }
// }
```

The dot-path tells stroid exactly where to go. Nothing outside that path is touched.

---

## Updating Arrays

```js
createStore("cart", {
  items: [
    { id: 1, name: "Shirt", qty: 1 },
    { id: 2, name: "Hat", qty: 2 }
  ]
})

// Update first item quantity
setStore("cart.items.0.qty", 3)

// Dynamic index
const index = 1
setStore(`cart.items.${index}.qty`, 5)
```

---

## Multiple Fields At Once

```js
// Update multiple fields in one call
setStore("user", {
  name: "Jo",
  theme: "light"
})
// score still untouched
```

---

## `.replace` — Full Replacement

When you need to completely replace a value or branch:

```js
// Replace entire store
setStore.replace("user", {
  name: "Jo",
  theme: "light"
  // score is GONE — intentional
})

// Replace a nested branch
setStore.replace("user.profile", {
  name: "Jo"
  // avatar is GONE — intentional
})

// Replace a single field (same as default for primitives)
setStore.replace("user.name", "Jo")
```

**When to use `.replace`:**
- You want a clean slate for a branch
- You're resetting a section of state
- You explicitly want to remove keys

---

## Updating Outside React

`setStore` works anywhere — not just in React components:

```js
// In event handlers
document.addEventListener("visibilitychange", () => {
  setStore("app.isVisible", !document.hidden)
})

// In async functions
async function login(credentials) {
  const user = await api.login(credentials)
  setStore("auth", {
    user,
    token: user.token,
    isLoggedIn: true
  })
}

// In setTimeout
setTimeout(() => {
  setStore("session.isExpired", true)
}, SESSION_TIMEOUT)
```

---

## TypeScript

```ts
interface UserState {
  name: string
  theme: "dark" | "light"
  score: number
}

createStore<UserState>("user", {
  name: "Eli",
  theme: "dark",
  score: 0
})

// TypeScript validates the value type
setStore("user.theme", "light")     // ✅
setStore("user.theme", "purple")    // ❌ TypeScript error
setStore("user.score", "hundred")   // ❌ TypeScript error
```

---

## Rules

| Rule | Detail |
|------|--------|
| Path must exist | `setStore` won't create new keys — use `mergeStore` |
| Store must exist | If store not created yet, warns and no-ops |
| Empty path warns | `setStore("", value)` warns and no-ops |
| Default is merge | Never destroys untouched keys |
| `.replace` is explicit | Only way to remove existing keys |

---

## Common Patterns

### Login
```js
async function handleLogin(credentials) {
  setStore("auth", { isLoading: true })
  try {
    const user = await api.login(credentials)
    setStore("auth", {
      user,
      isLoggedIn: true,
      isLoading: false
    })
  } catch (error) {
    setStore("auth", {
      error: error.message,
      isLoading: false
    })
  }
}
```

### Toggle
```js
function toggleTheme() {
  const current = getStore("user.theme")
  setStore("user.theme", current === "dark" ? "light" : "dark")
}
```

### Increment
```js
function addToCart(item) {
  const items = getStore("cart.items")
  setStore("cart.items", [...items, item])
  setStore("cart.total", getStore("cart.total") + item.price)
}
```

---

**[← Chapter 4 — createStore](./04-createStore.md)** · **[Chapter 6 — mergeStore →](./06-mergeStore.md)**