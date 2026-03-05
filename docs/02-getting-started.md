# Chapter 2 — Getting Started

> *"The best API is the one you don't have to think about."*

---

## Installation

```bash
npm install stroid
```

That's one install. Everything lives inside. You import only what you need.

---

## Your First Store

```js
import { createStore } from "stroid/core"

createStore("user", {
  name: "Eli",
  theme: "dark",
  isLoggedIn: false
})
```

One line. Your store exists. No Provider. No configuration. No boilerplate.

---

## Reading State In React

```js
import { useStore } from "stroid/react"

function Profile() {
  const name = useStore("user.name")
  return <h1>Hello, {name}</h1>
}
```

`useStore` takes a dot-path. It subscribes automatically. It re-renders only when that specific value changes.

---

## Updating State

```js
import { setStore } from "stroid/core"

// Update a single field
setStore("user.name", "Jo")

// Update multiple fields
setStore("user", { name: "Jo", theme: "light" })

// Replace an entire branch
setStore.replace("user", { name: "Jo", theme: "light", isLoggedIn: true })
```

---

## A Complete Example

```js
import { createStore, setStore } from "stroid/core"
import { useStore } from "stroid/react"

// Create once — anywhere outside components
createStore("counter", { count: 0 })

function Counter() {
  const count = useStore("counter.count")

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setStore("counter.count", count + 1)}>
        Increment
      </button>
      <button onClick={() => setStore("counter.count", 0)}>
        Reset
      </button>
    </div>
  )
}
```

---

## Subpath Imports — What Goes Where

Stroid is modular. You import from the right subpath:

```js
// Core — works everywhere (React, Node, Vanilla JS)
import { createStore, setStore, mergeStore, getStore } from "stroid/core"

// React — hooks, only in React apps
import { useStore, useSelector } from "stroid/react"

// Persistence — localStorage/sessionStorage
import { persist } from "stroid/persist"

// Sync — cross-tab BroadcastChannel or WebSocket
import { sync } from "stroid/sync"

// Async — SWR-style async stores
import { createQuery } from "stroid/async"

// Middleware — logger, validator, throttle
import { logger } from "stroid/middleware"

// Schema — state validation
import { defineSchema } from "stroid/schema"

// SSR — server side rendering helpers
import { hydrateStores } from "stroid/ssr"
```

**Dev only — separate packages:**
```bash
npm install stroid-devtools --save-dev
npm install stroid-test --save-dev
```

---

## TypeScript

Stroid is written in TypeScript. Full type inference works out of the box:

```ts
interface UserState {
  name: string
  theme: "dark" | "light"
  isLoggedIn: boolean
}

createStore<UserState>("user", {
  name: "Eli",
  theme: "dark",
  isLoggedIn: false
})

// name is inferred as string
const name = useStore("user.name")
```

---

## Next Steps

You now know enough to build a real application with stroid. The rest of this book goes deeper on each piece.

Continue with [Chapter 3 — Core Philosophy](./03-core-philosophy.md) to understand the thinking behind the API, or jump directly to [Chapter 4 — createStore](./04-createStore.md) to start building.

---

**[← Chapter 1 — Why Stroid](./01-why-stroid.md)** · **[Chapter 3 — Core Philosophy →](./03-core-philosophy.md)**