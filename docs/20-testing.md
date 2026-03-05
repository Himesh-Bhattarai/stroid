# Chapter 20 -- Testing

> "Test state like any other module."

---

## Imports

```js
import {
  createMockStore,
  resetAllStoresForTest,
  withMockedTime,
  benchmarkStoreSet,
} from "stroid/testing"
```

---

## Reset Between Tests

```js
beforeEach(() => resetAllStoresForTest())
```

Clears all stores to avoid cross-test pollution.

---

## createMockStore

```js
const mock = createMockStore("user", { name: "Eli" })
mock.set({ name: "Jo" })
expect(getStore("user.name")).toBe("Jo")
```

---

## Time Control

```js
withMockedTime(1700000000000, () => {
  setStore("clock.now", Date.now())
})
```

---

## Micro-benchmarks

```js
const result = benchmarkStoreSet("perf", 1000)
console.log(result.avgMs)
```

---

**[<- Chapter 19 -- Devtools](./19-devtools.md) :: [Chapter 21 -- Architecture ->](./21-architecture.md)**
