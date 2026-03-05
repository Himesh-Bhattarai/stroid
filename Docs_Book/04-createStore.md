# Chapter 4 — createStore

> *"A store is not just data. It's data with a lifetime, a scope, and a purpose."*

---

## Basic Usage

```js
import { createStore } from "stroid/core"

createStore("storeName", initialState, options)
```

Three arguments:
- **name** — unique string identifier
- **initialState** — plain object
- **options** — lifetime and behavior configuration

---

## The Simplest Store

```js
createStore("counter", { count: 0 })
```

No options needed. This store is global by default and lives for the entire application lifetime.

---

## Lifetime Options

The most important decision when creating a store is its lifetime. Stroid gives you two options:

### `isGlobal`
```js
createStore("auth", {
  user: null,
  token: null,
  isLoggedIn: false
}, {
  isGlobal: true
})
```

The store is accessible from anywhere in your application. It persists for the entire app lifetime. Use this for state that needs to be shared across many components and many pages.

**Real world use cases:**
- Authentication state
- User preferences
- App-wide theme
- Shopping cart
- Notifications

### `isTemp`
```js
createStore("checkoutForm", {
  email: "",
  cardNumber: "",
  expiry: ""
}, {
  isTemp: true
})
```

The store is automatically destroyed when the component that created it unmounts. No cleanup code needed. No memory leaks possible.

**Real world use cases:**
- Form state
- Modal state
- Wizard/multi-step state
- Dropdown state
- Any UI-only state tied to one component

---

## Default Behavior

```js
// No options — this store lives forever
// Not explicitly global, not temp
// Stroid warns in dev if created inside a component
createStore("user", { name: "Eli" })
```

In development, stroid will warn you if a store without `isTemp: true` is created inside a component — a common source of memory leaks.

---

## Options Reference

```js
createStore("storeName", initialState, {
  isGlobal: boolean,  // default: false
  isTemp: boolean,    // default: false
})
```

| Option | Default | Behavior |
|--------|---------|---------|
| `isGlobal` | `false` | Accessible everywhere, lives forever |
| `isTemp` | `false` | Auto-destroyed on component unmount |

---

## Combining Options

```js
// Global AND temp — accessible everywhere but cleans up
// Example: a global loading overlay tied to a root component
createStore("globalLoader", { visible: false }, {
  isGlobal: true,
  isTemp: true
})
```

When both are true, the store is globally accessible but still destroyed when the creating component unmounts.

---

## Where To Create Stores

Stores should be created **outside components** unless they are truly component-scoped.

```js
// ✅ Good — outside component, global store
createStore("auth", { user: null }, { isGlobal: true })

function App() {
  return <Router />
}
```

```js
// ✅ Good — inside component, isTemp declared
function CheckoutPage() {
  createStore("checkoutForm", { email: "" }, { isTemp: true })
  // ...
}
```

```js
// ⚠️ Warning in dev — inside component, no isTemp
function ProfilePage() {
  createStore("profileForm", { name: "" })
  // stroid warns: consider { isTemp: true }
}
```

---

## TypeScript

```ts
interface AuthState {
  user: User | null
  token: string | null
  isLoggedIn: boolean
}

createStore<AuthState>("auth", {
  user: null,
  token: null,
  isLoggedIn: false
}, {
  isGlobal: true
})
```

Full type inference flows through to `getStore`, `setStore`, and `useStore` automatically.

---

## Checking If A Store Exists

```js
import { hasStore } from "stroid/core"

if (hasStore("auth")) {
  // store exists
}
```

---

## Listing All Stores

```js
import { listStores } from "stroid/core"

const stores = listStores()
// ["auth", "user", "cart", "checkoutForm"]
```

Useful for debugging and devtools.

---

## Store Metadata

```js
import { getStoreMeta } from "stroid/core"

const meta = getStoreMeta("auth")
// {
//   name: "auth",
//   isGlobal: true,
//   isTemp: false,
//   createdAt: 1234567890,
//   updatedAt: 1234567891
// }
```

---

## Common Patterns

### Auth Store
```js
createStore("auth", {
  user: null,
  token: null,
  isLoggedIn: false,
  permissions: []
}, {
  isGlobal: true
})
```

### Theme Store
```js
createStore("theme", {
  mode: "dark",
  primaryColor: "#6366f1",
  fontSize: "medium"
}, {
  isGlobal: true
})
```

### Form Store
```js
// Inside component
createStore("loginForm", {
  email: "",
  password: "",
  errors: {},
  isSubmitting: false
}, {
  isTemp: true
})
```

### Cart Store
```js
createStore("cart", {
  items: [],
  total: 0,
  currency: "USD"
}, {
  isGlobal: true
})
```

---

**[← Chapter 3 — Core Philosophy](./03-core-philosophy.md)** · **[Chapter 5 — setStore →](./05-setStore.md)**