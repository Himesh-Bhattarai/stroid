# Chapter 3 — Core Philosophy

> *"Simple things should be simple. Complex things should be possible."*

---

## The Three Rules

Every decision in stroid is guided by three rules.

---

### Rule 1 — One Mental Model

No matter what you're doing — reading, writing, async, sync, persist — the mental model never changes.

```js
createStore()   // define
setStore()      // update
useStore()      // read
```

Everything else in stroid is built on top of these three primitives. Learn them once. Use them forever.

---

### Rule 2 — Declare Intent, Not Mechanics

You tell stroid **what** you want. Stroid figures out **how**.

```js
// You say what you want
createStore("form", { email: "" }, { isTemp: true })

// Stroid figures out:
// - scope this to the component
// - clean it up on unmount
// - warn if accidentally used globally
// You never write cleanup code
```

---

### Rule 3 — Pay Only For What You Use

The core is tiny. Every feature is optional. Your bundle only contains what you import.

```
Import only core + react  →  ~4KB gzip
Add persistence           →  ~5.5KB gzip
Add sync                  →  ~6.5KB gzip
Add everything            →  ~8KB gzip
```

---

## Store Lifetime — A First Class Concept

Most state libraries treat all state the same. Stroid doesn't.

Some state lives forever. Some state lives only while a component is mounted. Some state should be clearable. These are fundamentally different things and stroid treats them differently from the start.

```js
// Global — lives for entire app lifetime
createStore("auth", { user: null }, {
  isGlobal: true
})

// Temporary — lives while component is mounted
createStore("checkoutForm", { email: "" }, {
  isTemp: true
})
```

**Why this matters:** In a typical React application, developers write dozens of `useEffect` cleanup functions to handle state that should go away when a component unmounts. Stroid eliminates that entirely. Declare the lifetime once. Stroid handles the rest.

---

## Shallow Merge By Default

When you update state, stroid merges by default. It never destroys data you didn't explicitly replace.

```js
createStore("user", {
  name: "Eli",
  theme: "dark",
  permissions: ["read", "write"]
})

// Only name changes. theme and permissions untouched.
setStore("user", { name: "Jo" })

// Result: { name: "Jo", theme: "dark", permissions: ["read", "write"] }
```

When you want to replace, you say so explicitly:

```js
setStore.replace("user", { name: "Jo" })
// Result: { name: "Jo" }
// theme and permissions are gone — intentional
```

**The rule:** Stroid never destroys data by accident. Destruction is always explicit.

---

## Dot-Path Navigation

Stroid uses dot-paths to navigate nested state. This is the single most important pattern in stroid.

```js
// Read deeply nested value
const city = getStore("user.address.city")

// Update deeply nested value — surgical, nothing else touched
setStore("user.address.city", "NYC")

// Works with arrays
setStore("cart.items.0.quantity", 3)

// Dynamic paths
const field = "theme"
setStore(`user.${field}`, "light")
```

No spread operators. No manual tree reconstruction. Just say the path.

---

## Modular But Unified

Stroid is one package. One install. But internally modular.

```
npm install stroid
```

Then you import exactly what you need:

```js
// Minimal — just the basics
import { createStore, setStore } from "stroid/core"
import { useStore } from "stroid/react"

// As you grow — add features
import { persist } from "stroid/persist"
import { sync } from "stroid/sync"
```

**The key insight:** You never pay for features you don't use. A production app using only core and react pays ~4KB gzip. Not a byte more.

---

## The Extension Model

Stroid core exposes internal hooks. Everything — devtools, logging, testing — plugs into those hooks without touching core.

```
Core emits events
  ↓
Extensions listen
  ↓
Core never imports extensions
```

This keeps core tiny and extensions optional forever.

---

**[← Chapter 2 — Getting Started](./02-getting-started.md)** · **[Chapter 4 — createStore →](./04-createStore.md)**