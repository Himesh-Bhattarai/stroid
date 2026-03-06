# Chapter 2 -- Getting Started

> "The best API is the one you do not have to think about."

---

## Installation

```bash
npm install stroid
```

One package, no peer utilities required. Import only what you need.

---

## Your First Store

```js
import { createStore } from "stroid"

createStore("user", {
  name: "Eli",
  theme: "dark",
  isLoggedIn: false
})
```

---

## Reading State In React

```js
import { useStore } from "stroid/react"

function Profile() {
  const name = useStore("user", "name")
  return <h1>Hello, {name}</h1>
}
```

`useStore` takes the store name plus either a path or a selector and re-renders only when that subscribed value changes.

---

## Updating State

```js
import { setStore } from "stroid"

// Merge into the store
setStore("user", { name: "Jo", theme: "light" })

// Target a nested field
setStore("user", "name", "Jo")

// Mutate with a draft-style function
setStore("user", draft => { draft.score = (draft.score ?? 0) + 1 })
```

`setStore` shallow-merges object updates, validates paths, and supports draft-style mutators.

---

## Complete Example

```js
import { createStore, setStore } from "stroid"
import { useStore } from "stroid/react"

createStore("counter", { count: 0 })

function Counter() {
  const count = useStore("counter", "count")
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setStore("counter", "count", (count ?? 0) + 1)}>
        Increment
      </button>
      <button onClick={() => setStore("counter", "count", 0)}>
        Reset
      </button>
    </div>
  )
}
```

---

## Subpath Imports

```js
// Core (usable in any JS environment)
import { createStore, setStore, mergeStore, getStore } from "stroid/core"

// React hooks
import { useStore, useSelector } from "stroid/react"

// Async helpers
import { fetchStore, refetchStore } from "stroid/async"

// Testing helpers
import { createMockStore } from "stroid/testing"
```

Persistence, sync, middleware, schema, devtools, and history are configured via the `createStore` options; there are no separate subpackages for them in v0.0.4.

---

**[<- Chapter 1 -- Why Stroid](./01-why-stroid.md) :: [Chapter 3 -- Core Philosophy ->](./03-core-philosophy.md)**
