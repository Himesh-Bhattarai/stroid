# Migrating from Zustand

> **Comparison:** Zustand vs Stroid &nbsp;|&nbsp; **Last Updated:** 2026-03-29
>
> *Help migrating from Zustand to Stroid*

---

## 📚 Table of Contents

- [Conceptual Differences](#-conceptual-differences)
- [Store Setup](#-store-setup)
- [Getters & Setters](#-getters--setters)
- [Selectors & Subscriptions](#-selectors--subscriptions)
- [Multiple Stores](#-multiple-stores)
- [Middleware](#-middleware)
- [Async Patterns](#-async-patterns)
- [Complete Example](#-complete-example)

---

## 🧭 Conceptual Differences

| Aspect | Zustand | Stroid |
|--------|---------|--------|
| **Store API** | Single hook-based create | Named stores (multiple) |
| **State access** | `state => (...)` arrow functions | Direct dot paths or selectors |
| **Updates** | `setState` callbacks | `setStore` or mutator functions |
| **Hook subscribers** | `useStore` custom | Built-in `useStore` + `useSelector` |
| **Async** | Middleware or hooks | Native `fetchStore` |
| **SSR** | Context + snapshot | Request-scoped registries |

---

## 🏗️ Store Setup

### Zustand (Before)

```ts
import create from "zustand"

interface UserStore {
  user: { name: string } | null
  setUser: (user: { name: string }) => void
}

const useUserStore = create<UserStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}))

function App() {
  const { user, setUser } = useUserStore()
  return <></>
}
```

### Stroid (After)

```ts
import { createStore, setStore } from "stroid"
import { useStore } from "stroid/react"

createStore("user", null)

function App() {
  const user = useStore("user")
  return <></>
}
```

---

## 🔄 Async Patterns

### Zustand (Before)

```ts
const useStore = create((set) => ({
  data: null,
  isLoading: false,
  error: null,
  fetchData: async () => {
    set({ isLoading: true })
    try {
      const data = await fetch("/api/data").then(r => r.json())
      set({ data, isLoading: false })
    } catch (error) {
      set({ error, isLoading: false })
    }
  },
}))
```

### Stroid (After)

```ts
import { fetchStore } from "stroid/async"
import { useAsyncStore } from "stroid/react"

function Component() {
  const { data, isLoading, error } = useAsyncStore(
    "data",
    fetchStore("/api/data")
  )
}
```

---

## 📚 Documentation

- [Core Concepts](../core-concepts/STORES.md)
- [React Hooks](../STROID_REACT/INDEX.md)
- [Async](../STROID_ASYNC/INDEX.md)
