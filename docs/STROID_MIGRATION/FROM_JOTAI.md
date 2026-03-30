# Migrating from Jotai

> **Comparison:** Jotai vs Stroid &nbsp;|&nbsp; **Last Updated:** 2026-03-29
>
> *Help migrating from Jotai to Stroid*

---

## 📚 Table of Contents

- [Conceptual Differences](#-conceptual-differences)
- [Atoms → Stores](#-atoms--stores)
- [Hooks](#-hooks)
- [Derived State](#-derived-state)
- [Async Values](#-async-values)
- [Complete Example](#-complete-example)

---

## 🧭 Conceptual Differences

| Aspect | Jotai | Stroid |
|--------|-------|--------|
| **Primitives** | Atoms (fine-grained) | Named stores (named slots) |
| **Dependencies** | Automatic tracking | Explicit selectors |
| **Rendering** | Granular (atom-level) | Store-level subscriptions |
| **Async** | `atomWithAsync` | `fetchStore` |
| **API** | `useAtomValue`, `useSetAtom` | `useStore` (reads + writes) |

---

## 🏗️ Atoms → Stores

### Jotai (Before)

```ts
import { atom } from "jotai"
import { useAtomValue, useSetAtom } from "jotai"

const userAtom = atom({ name: "Alice", role: "user" })
const postsAtom = atom([])

function Profile() {
  const user = useAtomValue(userAtom)
  const setUser = useSetAtom(userAtom)

  return (
    <>
      <h1>{user.name}</h1>
      <button onClick={() => setUser({ ...user, role: "admin" })}>
        Promote
      </button>
    </>
  )
}
```

### Stroid (After)

```ts
import { createStore, useStore, setStore } from "stroid"

createStore("user", { name: "Alice", role: "user" })
createStore("posts", [])

function Profile() {
  const user = useStore("user")

  return (
    <>
      <h1>{user.name}</h1>
      <button
        onClick={() =>
          setStore("user", (draft) => {
            draft.role = "admin"
          })
        }
      >
        Promote
      </button>
    </>
  )
}
```

---

## 🪝 Hooks

### Jotai (Before)

```ts
import { useAtomValue, useSetAtom } from "jotai"

const nameAtom = atom("Alice")
const ageAtom = atom(30)

function Component() {
  const name = useAtomValue(nameAtom) // Read-only
  const setName = useSetAtom(nameAtom) // Write-only

  return (
    <input
      value={name}
      onChange={(e) => setName(e.target.value)}
    />
  )
}
```

### Stroid (After)

```ts
import { useStore, useStoreField } from "stroid/react"

createStore("form", { name: "Alice", age: 30 })

function Component() {
  // Read-write in one hook
  const name = useStore("form", "name")

  // Or use convenience hook
  const name = useStoreField("form", "name")

  return (
    <input
      value={name}
      onChange={(e) =>
        setStore("form", { name: e.target.value })
      }
    />
  )
}
```

---

## 📊 Derived State

### Jotai (Before)

```ts
import { atom } from "jotai"
import { useAtomValue } from "jotai"

const usersAtom = atom([
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
])

const userCountAtom = atom((get) => {
  const users = get(usersAtom)
  return users.length
})

function UserCount() {
  const count = useAtomValue(userCountAtom) // Auto re-renders on change
  return <p>Total: {count}</p>
}
```

### Stroid (After)

```ts
import { useSelector } from "stroid/react"
import { useMemo } from "react"

createStore("users", [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
])

function UserCount() {
  // Selector with memoization
  const count = useSelector("users", (users) => users.length)
  return <p>Total: {count}</p>

  // Or use useMemo for complex logic
  // const count = useMemo(
  //   () => getStore("users").length,
  //   [updateCount] // Track updates manually if needed
  // )
}
```

---

## 🔄 Async Values

### Jotai (Before)

```ts
import { atomWithAsync } from "jotai/utils"
import { useAtomValue } from "jotai"

const userAtom = atomWithAsync(
  async () => {
    const res = await fetch("/api/user")
    return res.json()
  },
  { ssr: true }
)

function UserProfile() {
  const user = useAtomValue(userAtom)
  // Jotai handles loading/error internally via Suspense
  return <h1>{user.name}</h1>
}
```

### Stroid (After)

```ts
import { fetchStore } from "stroid/async"
import { useAsyncStore } from "stroid/react"

function UserProfile() {
  const { data: user, isLoading, error } = useAsyncStore(
    "user",
    fetchStore("/api/user")
  )

  if (isLoading) return <Spinner />
  if (error) return <Error error={error} />
  return <h1>{user.name}</h1>
}

// Or with Suspense
function UserProfileWithSuspense() {
  const user = fetchStore("/api/user", { suspense: true })
  // Throws promise during loading
  return <h1>{user.data.name}</h1>
}
```

---

## 📋 Complete Example

### Jotai Version

```ts
import { atom } from "jotai"
import {
  useAtomValue,
  useSetAtom,
  useAtom,
} from "jotai"
import { atomWithAsync } from "jotai/utils"
import { useEffect } from "react"

const counterAtom = atom(0)

const userAtom = atomWithAsync(async () => {
  const res = await fetch("/api/user")
  return res.json()
}, { ssr: true })

const filteredAtom = atom((get) => {
  const count = get(counterAtom)
  return count > 5
})

function App() {
  const count = useAtomValue(counterAtom)
  const setCount = useSetAtom(counterAtom)

  const user = useAtomValue(userAtom)
  const isHigh = useAtomValue(filteredAtom)

  return (
    <div>
      <p>Count: {count} {isHigh && "📈"}</p>
      <button onClick={() => setCount((c) => c + 1)}>+1</button>
      <p>User: {user?.name}</p>
    </div>
  )
}
```

### Stroid Version

```ts
import { createStore, setStore, getStore } from "stroid"
import { useStore, useSelector } from "stroid/react"
import { fetchStore, useAsyncStore } from "stroid/async"
import { useEffect } from "react"

createStore("counter", 0)

function App() {
  const count = useStore("counter")

  const isHigh = useSelector("counter", (c) => c > 5)

  const { data: user } = useAsyncStore(
    "user",
    fetchStore("/api/user")
  )

  return (
    <div>
      <p>Count: {count} {isHigh && "📈"}</p>
      <button
        onClick={() =>
          setStore("counter", (draft) => draft + 1)
        }
      >
        +1
      </button>
      <p>User: {user?.name}</p>
    </div>
  )
}
```

---

## 🔄 Migration Checklist

- [ ] Replace Jotai atoms with Stroid stores
- [ ] Replace `useAtomValue` with `useStore`
- [ ] Replace `useSetAtom` with direct `setStore` calls
- [ ] Replace `atomWithAsync` with `fetchStore` + `useAsyncStore`
- [ ] Replace derived atoms with `useSelector`
- [ ] Remove Jotai Provider if not needed for other purposes
- [ ] Test SSR if used

---

## 📚 Documentation

- [Core Concepts](../STROID_CORE/INDEX.md)
- [React Hooks](../STROID_REACT/INDEX.md)
- [Async](../STROID_ASYNC/INDEX.md)
