# React Layer Guide

> **Confidence: HIGH** — derived from `src/react/hooks-core.ts`, `hooks-async.ts`, `hooks-form.ts`, `hooks-async-suspense.ts`, `registry.ts`.

---

## Setup

```bash
npm install stroid
# React >=18 is a peer dependency
```

```ts
import { useStore, useSelector } from "stroid/react"
```

No provider required for the default (browser) use case. In SSR, hooks automatically use the active request registry inside `createStoreForRequest(...).hydrate(...)`. Use `RegistryScope` when you need to render outside that scope or explicitly override the registry.

---

## `useStore`

The primary hook. Subscribes to a store and re-renders when the relevant data changes.

```tsx
// Full store (re-renders on any change — warns once about broad subscription)
const user = useStore("user")

// Path (re-renders only when "role" changes)
const role = useStore("user", "profile.role")

// Selector (re-renders only when the return value changes per Object.is)
const isAdmin = useStore("user", s => s.role === "admin")

// Selector with custom equality
const ids = useStore("cart", s => s.items.map(i => i.id), shallowEqual)
```

Returns `null` if the store does not exist. Components re-render when the store is created later.

### Stable Selectors

Inline selectors (created fresh each render) trigger a dev warning about selector identity churn. The subscription stays stable, but selector cache reuse drops and selector work increases. Use `useCallback` or define selectors outside the component.

```tsx
// ✗ — inline, recreated each render
const total = useStore("cart", s => s.items.length)

// ✓ — stable reference
const selectItemCount = (s: CartState) => s.items.length
const total = useStore(cartStore, selectItemCount)
```

---

## `useSelector`

Like `useStore` with a selector, but uses `shallowEqual` as the default equality function instead of `Object.is`. Good for selectors that return new objects or arrays with the same contents.

```tsx
const cartSummary = useSelector("cart", s => ({
  count: s.items.length,
  total: s.items.reduce((acc, i) => acc + i.price, 0),
}))
// Only re-renders when count or total actually changes
```

---

## `useStoreField`

Convenience alias for `useStore(name, field)`.

```tsx
const name = useStoreField("user", "profile.name")
```

---

## `useStoreStatic`

Reads a store once without subscribing. The component does not re-render on subsequent changes.

```tsx
function LogInitialValue() {
  const initial = useStoreStatic("settings")
  useEffect(() => {
    analytics.track("settings_snapshot", initial)
  }, [])
  return null
}
```

---

## `useAsyncStore`

For stores managed by `fetchStore`. Returns a typed async snapshot.

```tsx
import { useAsyncStore } from "stroid/react"

function UserCard() {
  const { data, loading, error, status, isEmpty, revalidating } = useAsyncStore("user")

  if (loading)   return <Spinner />
  if (error)     return <ErrorBanner message={error} />
  if (isEmpty)   return <EmptyState />
  return <div>{data.name}</div>
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data` | `T \| null` | The fetched value |
| `loading` | `boolean` | True during the initial load |
| `revalidating` | `boolean` | True during background revalidation |
| `error` | `string \| null` | Error message if fetch failed |
| `status` | `"idle" \| "loading" \| "success" \| "error" \| "aborted"` | Lifecycle status |
| `isEmpty` | `boolean` | `data == null && !loading && !error` |

---

## `useFormStore`

Binds a store field to a form input.

```tsx
import { useFormStore } from "stroid/react"

function NameInput() {
  const { value, onChange } = useFormStore("profile", "name")
  return <input value={value ?? ""} onChange={onChange} />
}
```

`onChange` accepts both React synthetic events (`e.target.value`) and raw values. Checkboxes use `e.target.checked`.

---

## `useAsyncStoreSuspense`

Suspense-compatible hook. Must be wrapped in a `React.Suspense` boundary.

```tsx
import { useAsyncStoreSuspense } from "stroid/react"

function UserName() {
  // Throws a promise while loading. Resolves to data when successful.
  const name = useAsyncStoreSuspense("user", "/api/user", { ttl: 30_000 })
  return <span>{name}</span>
}

// Usage:
<React.Suspense fallback={<Spinner />}>
  <UserName />
</React.Suspense>
```

---

## Typed Store Names

Without augmentation, `useStore("name")` is loosely typed. Add `StoreStateMap` to a `.d.ts` file for full inference:

```ts
// src/stroid.d.ts
declare module "stroid" {
  interface StoreStateMap {
    user: {
      name: string
      role: "admin" | "user"
    }
    cart: {
      items: Array<{ id: string; price: number }>
    }
  }
}
```

After augmentation:
```ts
const role = useStore("user", "role")  // → "admin" | "user"
const items = useStore("cart", "items")  // → Array<{ id: string; price: number }>
```

To suppress the untyped-name warning without augmenting: `configureStroid({ acknowledgeLooseTypes: true })`.

---

## Typed Store Handles

Use `store()` for per-store type safety without global augmentation:

```ts
import { store } from "stroid"

const cartStore = store<"cart", { items: CartItem[] }>("cart")

// Now all hooks are fully typed:
const items = useStore(cartStore, "items")
const count = useSelector(cartStore, s => s.items.length)
```

---

## SSR with `RegistryScope`

When using `createStoreForRequest` for server rendering, you can optionally provide the request registry to the React tree:

```tsx
import { RegistryScope } from "stroid/react"

// On the server, inside createStoreForRequest:
const stores = createStoreForRequest((api) => {
  api.create("user", sessionUser)
})

stores.hydrate(() => {
  return renderToString(
    <RegistryScope value={stores.registry}>
      <App />
    </RegistryScope>
  )
})
```

Without `RegistryScope`, hooks resolve to the active request registry when rendering inside `createStoreForRequest(...).hydrate(...)`. Outside that scope, hooks fall back to the default (global) registry.
