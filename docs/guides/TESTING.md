# Testing Guide

> **Confidence: HIGH** — derived from `src/helpers/testing.ts`, `src/internals/test-reset.ts`.

---

## Import

```ts
import {
  createMockStore,
  resetAllStoresForTest,
  withMockedTime,
  benchmarkStoreSet,
} from "stroid/testing"
```

---

## Test Isolation

The most important rule: call `resetAllStoresForTest()` before each test. It hard-resets all stores, async state, config, and internal warning caches.

```ts
import { resetAllStoresForTest } from "stroid/testing"

beforeEach(() => {
  resetAllStoresForTest()
})
```

Without this, stores created in one test leak into the next.

---

## `createMockStore`

Creates a store and returns a convenience API.

```ts
const cart = createMockStore("cart", { items: [], total: 0 })

// Merge update
cart.set({ total: 50 })

// Mutator
cart.set(draft => { draft.items.push({ id: "1", price: 50 }) })

// Reset to initial state
cart.reset()

// Get the StoreDefinition handle (for use with useStore, getStore, etc.)
const handle = cart.use()
```

---

## Writing and Reading Stores in Tests

Use the regular public API — no special test-only wrappers needed:

```ts
import { createStore, setStore, getStore, resetStore } from "stroid"

test("cart total updates on item add", () => {
  createStore("cart", { items: [] })
  createStore("discount", { pct: 10 })
  createComputed("cartTotal", ["cart", "discount"], (c, d) =>
    c.items.reduce((s, i) => s + i.price, 0) * (1 - d.pct / 100)
  )

  setStore("cart", draft => { draft.items.push({ id: "1", price: 100 }) })

  expect(getStore("cartTotal")).toBe(90)
})
```

---

## Testing React Hooks

Use `@testing-library/react`. The hooks work in jsdom with no additional setup:

```tsx
import { renderHook, act } from "@testing-library/react"
import { useStore }         from "stroid/react"
import { setStore }         from "stroid"

test("useStore re-renders on change", async () => {
  createStore("counter", { value: 0 })

  const { result } = renderHook(() => useStore("counter", "value"))

  expect(result.current).toBe(0)

  act(() => { setStore("counter", "value", 1) })

  expect(result.current).toBe(1)
})
```

---

## Mocking Time

```ts
import { withMockedTime } from "stroid/testing"

test("session expires after 1h", () => {
  const now = 1_700_000_000_000
  withMockedTime(now, () => {
    createStore("session", { startedAt: Date.now() })
    // ...assertions using the frozen clock
  })
})
```

---

## Benchmarking

```ts
import { benchmarkStoreSet } from "stroid/testing"

test("cart writes are fast", () => {
  const cartStore = createMockStore("cart", { items: [], total: 0 })

  const result = benchmarkStoreSet(cartStore.use(), 5_000, (i) => ({
    total: i * 10,
  }))

  console.log(`ops/sec: ${result.opsPerSec}`)
  expect(result.opsPerSec).toBeGreaterThan(100_000)
})
```

---

## `assertRuntime` Mode

For test environments where you want to treat every stroid warning as an error:

```ts
import { configureStroid } from "stroid"

beforeAll(() => {
  configureStroid({ assertRuntime: true })
})
```

---

## Config Reset

If you modify `configureStroid` in tests, reset it as part of teardown:

```ts
import { resetConfig } from "stroid"

afterEach(() => {
  resetAllStoresForTest()  // also calls resetConfig internally
})
```

---

## Tips

- **Always use `resetAllStoresForTest()` in `beforeEach`**, not `afterEach`. This ensures a clean state even if a test crashes.
- **Test computed stores** by verifying the output store value after writing to a dependency.
- **Test lifecycle hooks** by asserting side effects in `onCreate`, `onSet`, etc.
- **Test persist** by providing a custom in-memory driver in test options so you don't touch real `localStorage`.
- **Test async (`fetchStore`)** with mocked `fetch` or a `transform` function that bypasses the network entirely.
