# Chapter 12 -- React Bindings

> "Zero wiring. Just read the state you need."

---

## Import

```js
import { useStore, useSelector } from "stroid/react"
```

React bindings live in `stroid/react` -- separate from core so non-React environments never pay the cost.

---

## useStore

The primary hook. Subscribes to a value and re-renders when it changes.

```js
// Read entire store
const user = useStore("user")

// Read specific field -- preferred
const name = useStore("user", "name")

// Read nested field
const city = useStore("user", "address.city")

// Or subscribe with a selector
const fullName = useStore("user", state => `${state.firstName} ${state.lastName}`)
```

### Automatic Subscription
`useStore` automatically subscribes to the value at the given path or selector. When that subscribed value changes, the component re-renders. When the component unmounts, the subscription is cleaned up automatically.

### Precision Matters
```js
// Warning: re-renders on ANY user change
const user = useStore("user")

// Best: re-renders ONLY when name changes
const name = useStore("user", "name")
```

Always read the most specific path you need. Stroid warns in development when you subscribe to an entire store object.

---

## useSelector

For derived or computed values:

```js
import { useSelector } from "stroid/react"

// Compute a value from state
const fullName = useSelector(
  "user",
  state => `${state.firstName} ${state.lastName}`
)

// Filter items
const expensiveItems = useSelector(
  "cart",
  state => state.items.filter(item => item.price > 100)
)
```

`useSelector` memoizes the result. The selector only re-runs when the underlying state changes.

If you need a reactive derived store that can be read outside React (or shared across tabs via the source stores),
use `createComputed(...)` from the core API.

---

## Reading Multiple Values

```js
function Dashboard() {
  const name = useStore("user", "name")
  const theme = useStore("user", "theme")
  const cartCount = useStore("cart", "items")?.length ?? 0
  const isLoggedIn = useStore("auth", "isLoggedIn")
}
```

Each hook subscribes independently. A change to `cart.items` only triggers the `cartCount` re-render -- not the entire component.

---

## Static Values

For values you read once and do not need to subscribe to:

```js
import { useStoreStatic } from "stroid/react"

function UserBadge() {
  // Reads once -- never re-renders due to this value
  const userId = useStoreStatic("user", "id")
  return <span data-id={userId}>...</span>
}
```

---

## With Async Stores

```js
function ProductList() {
  const { data: products, loading, error } = useStore("products") ?? {}

  if (loading) return <LoadingGrid />
  if (error) return <ErrorMessage error={error} />

  return (
    <ul>
      {products?.map(product => (
        <li key={product.id}>{product.name}</li>
      ))}
    </ul>
  )
}
```

---

## useAsyncStore + fetchStore (end-to-end)

```js
// Trigger the fetch anywhere (component effect, router loader, event handler)
fetchStore("products", "/api/products", { ttl: 30000, staleWhileRevalidate: true })

import { useAsyncStore } from "stroid/react"

function ProductsGrid() {
  const { data, loading, error, status, isEmpty } = useAsyncStore("products")

  if (loading) return <Spinner />
  if (error) return <p>Error: {error}</p>
  if (isEmpty) return <p>No products yet.</p>

  return data.map(p => <ProductCard key={p.id} product={p} />)
}
```

`useAsyncStore` normalizes the async shape to keep component logic small.

---

## No Provider Required

Unlike Redux, React Context, or Jotai -- stroid requires no Provider wrapper. There is no setup required in your component tree.

```js
// This just works -- no Provider needed
function App() {
  return <UserProfile />
}

function UserProfile() {
  const name = useStore("user", "name")
  return <h1>{name}</h1>
}
```

---

## TypeScript

Hooks read stores by string name, so they do not infer types from `createStore` automatically today. Pass generics when you want stronger typing:

```ts
const name = useStore<string>("user", "name")
const score = useStore<number>("user", "score")
const total = useSelector<{ items: Array<{ price: number }> }, number>(
  "cart",
  state => state.items.reduce((sum, item) => sum + item.price, 0)
)
```

---

## Other Hooks

- `useStoreField(storeName, field)` -> convenience alias for a single field.
- `useStoreStatic(name, path?)` -> read without subscribing.
- `useAsyncStore(name)` -> normalizes async stores to `{ data, loading, error, status, isEmpty }`.
- `useFormStore(name, field)` -> returns `{ value, onChange }` for form-centric patterns.

---

**[<- Chapter 11 -- createStoreForRequest](./11-createStoreForRequest.md) :: [Chapter 13 -- Async ->](./13-async.md)**
