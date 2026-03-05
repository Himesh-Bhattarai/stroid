# Chapter 20 — Testing

> *"Test state like you test everything else — simply."*

---

## Install

```bash
npm install stroid-test --save-dev
```

---

## The Problem With Testing State

Testing state in most libraries requires complex mocks, Provider wrappers, and careful teardown. Stroid makes it simple.

---

## Basic Setup

```js
import { resetAllStoresForTest } from "stroid-test"

beforeEach(() => {
  resetAllStoresForTest()
})
```

One line. Every store resets between tests. No pollution. No side effects.

---

## createMockStore

```js
import { createMockStore } from "stroid-test"

it("updates user name", () => {
  createMockStore("user", { name: "Eli", score: 0 })

  setStore("user.name", "Jo")

  expect(getStore("user.name")).toBe("Jo")
  expect(getStore("user.score")).toBe(0) // untouched
})
```

---

## Testing Async Stores

```js
import { mockAsync, waitForStore } from "stroid-test"

it("loads products", async () => {
  mockAsync("fetchProducts", {
    data: [{ id: 1, name: "Shirt" }],
    delay: 0
  })

  // Wait for loading to complete
  await waitForStore("fetchProducts", s => !s.loading)

  expect(getStore("fetchProducts.data")).toHaveLength(1)
})
```

---

## storeSnapshot

```js
import { storeSnapshot } from "stroid-test"

it("matches snapshot", () => {
  createMockStore("cart", { items: [], total: 0 })
  addItemToCart({ id: 1, price: 50 })

  expect(storeSnapshot("cart")).toMatchSnapshot()
})
```

---

## With React Testing Library

```js
import { render, screen, fireEvent } from "@testing-library/react"
import { createMockStore, resetAllStoresForTest } from "stroid-test"

beforeEach(() => resetAllStoresForTest())

it("renders user name", () => {
  createMockStore("user", { name: "Eli" })

  render(<UserProfile />)

  expect(screen.getByText("Eli")).toBeInTheDocument()
})

it("updates on click", () => {
  createMockStore("counter", { count: 0 })

  render(<Counter />)
  fireEvent.click(screen.getByText("Increment"))

  expect(screen.getByText("1")).toBeInTheDocument()
})
```

---

**[← Chapter 19 — Devtools](./19-devtools.md)** · **[Chapter 21 — Architecture →](./21-architecture.md)**