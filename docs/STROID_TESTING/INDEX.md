# 🧪 Testing Guide

> **Version:** 1.0 &nbsp;|&nbsp; **Last Updated:** 2026-03-29 &nbsp;|&nbsp; **Confidence:** ![HIGH](https://img.shields.io/badge/confidence-HIGH-brightgreen)
>
> *Derived from `src/helpers/testing.ts`*

---

## 📚 Table of Contents

- [Setup](#-setup)
- [createMockStore](#-createmockstore)
- [resetAllStoresForTest](#-resetallstoresfortest)
- [withMockedTime](#-withmockedtime)
- [benchmarkStoreSet](#-benchmarkstoreset)
- [Testing Patterns](#-testing-patterns)
- [Cleanup](#-cleanup)

---

## ⚙️ Setup

Import testing utilities:

```ts
import {
  createMockStore,
  resetAllStoresForTest,
  withMockedTime,
  benchmarkStoreSet,
} from "stroid/helpers"
```

---

## 🏗️ createMockStore

**Type:**
```ts
createMockStore<State>(
  name?: string,
  initial?: State
): {
  set: (update: PartialDeep<State> | ((draft: State) => void)) => void
  reset: () => void
  use: () => StoreDefinition<string, State>
}
```

Creates a temporary mock store for testing without polluting the global registry.

### Basic Usage

```ts
import { createMockStore } from "stroid/helpers"

test("user store updates", () => {
  const { set, use } = createMockStore("user", { name: "Alice", age: 30 })

  set({ age: 31 })

  const handle = use() // Connect in a hook
  // use(() => useStore(handle))
})
```

### With React Hooks

```ts
import { renderHook, act } from "@testing-library/react"
import { createMockStore } from "stroid/helpers"
import { useStore } from "stroid/react"

test("renders with mock store", () => {
  const { use } = createMockStore("user", { name: "Alice" })

  const { result } = renderHook(() => useStore(use()))

  expect(result.current).toEqual({ name: "Alice" })
})
```

### Mutator Pattern

```ts
export const { set, use, reset } = createMockStore("counter", { count: 0 })

test("increments counter", () => {
  set((draft) => {
    draft.count += 1
  })

  expect(getStore(use())).toEqual({ count: 1 })
})
```

---

## 🔄 resetAllStoresForTest

**Type:**
```ts
resetAllStoresForTest(): void
```

Clears all stores and async state — call in `beforeEach` or `afterEach`.

### Jest / Vitest Example

```ts
import { resetAllStoresForTest } from "stroid/helpers"

describe("Store Operations", () => {
  afterEach(() => {
    resetAllStoresForTest() // Clean up after each test
  })

  test("creates a store", () => {
    createStore("user", { name: "Alice" })
    expect(getStore("user")?.name).toBe("Alice")
  })

  test("next test starts fresh", () => {
    // No "user" store from previous test
    expect(getStore("user")).toBeUndefined()
  })
})
```

### Mocha Example

```ts
afterEach(() => {
  resetAllStoresForTest()
})
```

---

## ⏰ withMockedTime

**Type:**
```ts
withMockedTime<T>(nowMs: number, fn: () => T): T
```

Mock `Date.now()` for a given function — useful for testing time-dependent logic.

### Basic Usage

```ts
import { withMockedTime } from "stroid/helpers"

test("timestamp logic", () => {
  const result = withMockedTime(1000000, () => {
    return Date.now() // Returns 1000000
  })

  expect(result).toBe(1000000)
})
```

### With TTL / Caching

```ts
test("cache expires", () => {
  const expireAt = 2000000

  const isFresh = withMockedTime(1000000, () => {
    return Date.now() < expireAt
  })

  const isExpired = withMockedTime(2500000, () => {
    return Date.now() < expireAt
  })

  expect(isFresh).toBe(true)
  expect(isExpired).toBe(false)
})
```

### With fetchStore

```ts
import { fetchStore } from "stroid/async"

test("revalidate on focus", () => {
  withMockedTime(1000000, () => {
    fetchStore("https://api.example.com/user", { ttl: 60000 })
  })

  // Check if cache is still fresh
  const isFresh = withMockedTime(1010000, () => {
    return Date.now() - 1000000 < 60000 // 10s elapsed, 60s TTL
  })

  expect(isFresh).toBe(true)
})
```

---

## 🔬 benchmarkStoreSet

**Type:**
```ts
benchmarkStoreSet<State>(
  name: StoreDefinition | StoreKey,
  iterations?: number,
  makeUpdate?: (i: number) => PartialDeep<State>
): {
  iterations: number
  totalMs: number
  avgMs: number
}
```

Measures the performance of repeated store writes.

### Basic Benchmark

```ts
import { benchmarkStoreSet } from "stroid/helpers"

test("store write performance", () => {
  createStore("data", { value: 0 })

  const result = benchmarkStoreSet("data", 1000, (i) => ({ value: i }))

  console.log(`${result.iterations} writes in ${result.totalMs}ms`)
  console.log(`Average: ${result.avgMs}ms per write`)

  expect(result.avgMs).toBeLessThan(0.1) // Less than 0.1ms per write
})
```

### Custom Update Generator

```ts
const result = benchmarkStoreSet("user", 10000, (i) => ({
  timestamp: Date.now(),
  count: i,
  nested: { deep: { value: i } }
}))

console.log(result)
// { iterations: 10000, totalMs: 45, avgMs: 0.0045 }
```

### Memory Pressure Test

```ts
test("large object updates", () => {
  const largeArray = Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    value: Math.random(),
    nested: { data: "x".repeat(100) }
  }))

  createStore("bigData", largeArray)

  const result = benchmarkStoreSet("bigData", 100, (i) => ({
    0: { ...largeArray[0], updated: true }
  }))

  console.log(result) // Check if performance degrades significantly
})
```

---

## 📋 Testing Patterns

### Component Integration Test

```ts
import { renderHook } from "@testing-library/react"
import { createMockStore } from "stroid/helpers"
import { useStore } from "stroid/react"

test("useStore with mock", () => {
  const { use, set } = createMockStore("form", {
    name: "",
    email: "",
    submitted: false
  })

  const { result, rerender } = renderHook(() => useStore(use()))

  expect(result.current.name).toBe("")

  set({ name: "Alice" })
  rerender()

  expect(result.current.name).toBe("Alice")
})
```

### Async Store Testing

```ts
import { fetchStore } from "stroid/async"
import { resetAllStoresForTest } from "stroid/helpers"

describe("Async Store", () => {
  beforeEach(() => {
    resetAllStoresForTest() // Resets async state too!
  })

  test("fetches data", async () => {
    fetchStore("https://api.example.com/user", {
      onError: (err) => console.error(err)
    })

    // Wait for completion
    await new Promise(resolve => setTimeout(resolve, 100))

    const state = getStore("user")
    expect(state).toHaveProperty("data")
  })
})
```

### Store Snapshot Testing

```ts
import { getStore } from "stroid"

test("store state snapshot", () => {
  createStore("router", { page: "home", params: {} })
  createStore("auth", { user: null, isLoading: false })

  const snapshot = {
    router: getStore("router"),
    auth: getStore("auth")
  }

  expect(snapshot).toMatchSnapshot()
})
```

---

## 🧹 Cleanup

### Manual Cleanup

```ts
import { resetStore } from "stroid"

test("with manual reset", () => {
  createStore("temp", { value: 1 })
  expect(getStore("temp")).toBeDefined()

  resetStore("temp")
  // Try to get it again
  expect(getStore("temp")).toBeUndefined()
})
```

### Automatic Cleanup (Recommended)

```ts
import { resetAllStoresForTest } from "stroid/helpers"

describe("My Tests", () => {
  afterEach(() => {
    resetAllStoresForTest() // Clears everything
  })

  test("first", () => {
    createStore("a", { x: 1 })
  })

  test("second", () => {
    createStore("b", { y: 2 })
    // "a" from first test is gone
  })
})
```

---

## 💡 Best Practices

| Practice | Details |
|----------|---------|
| **Reset after each test** | Always call `resetAllStoresForTest()` in `afterEach` |
| **Use mock stores** | Create isolated stores per test with `createMockStore` |
| **Test async properly** | Account for async timing and use `withMockedTime` for TTL logic |
| **Benchmark wisely** | Run benchmarks separately from unit tests (noise) |
| **Snapshot stores cautiously** | Good for catching unwanted state changes, but update snapshots deliberately |

---

## 🔗 Related

- **Async testing:** See [STROID_ASYNC](../STROID_ASYNC/INDEX.md) for `fetchStore` testing
- **Devtools:** See [STROID_DEVTOOL](../STROID_DEVTOOL/INDEX.md) to inspect test state with `getHistory()`
- **React testing:** [Testing Library](https://testing-library.com/)
