# TypeScript & Advanced Patterns

> **Confidence: HIGH** — derived from `src/core/store-lifecycle/types.ts`, `src/adapters/options.ts`, source code type signatures.

---

## Typed Store Names (Module Augmentation)

The cleanest path to full type safety for string-based store access:

```ts
// src/stroid.d.ts  (or any .d.ts file in your project)
declare module "stroid" {
  interface StoreStateMap {
    user: {
      name: string
      role: "admin" | "user"
      profile: { bio: string; avatar: string }
    }
    cart: {
      items: Array<{ id: string; price: number; name: string }>
      discount: number
    }
  }
}
```

After this, string-based APIs are fully typed:

```ts
getStore("user", "profile.bio")           // → string | null
setStore("user", "role", "admin")         // ✓ (string literal checked)
setStore("user", "role", "superuser")     // ✗ TypeScript error
useStore("cart", s => s.items.length)     // → number | null
```

---

## Strict Store Map

For stricter enforcement — unknown store names become TypeScript errors:

```ts
declare module "stroid" {
  interface StrictStoreMap {
    user:    UserState
    cart:    CartState
  }
}
```

With `StrictStoreMap`, `getStore("unknown")` is a compile error. With `StoreStateMap`, it falls back to `unknown`.

---

## Typed Store Handles

For per-store type safety without global augmentation:

```ts
import { store } from "stroid"

const cartStore = store<"cart", CartState>("cart")

// Full type inference on all operations:
setStore(cartStore, draft => { draft.items.push(item) })
getStore(cartStore, "items")        // → CartState["items"] | null
useStore(cartStore, s => s.items)   // → CartState["items"] | null
```

---

## `HydrateSnapshotFor`

Compute a typed snapshot shape from your store map:

```ts
import type { HydrateSnapshotFor, StoreStateMap } from "stroid"

type ServerSnapshot = HydrateSnapshotFor<StoreStateMap>
// Equivalent to: Partial<{ user: UserState; cart: CartState; ... }>

hydrateStores<ServerSnapshot>(snapshot, {}, { allowTrusted: true })
```

---

## Path Types

```ts
import type { Path, PathValue } from "stroid"

type UserPaths = Path<UserState>
// → "name" | "role" | "profile" | "profile.bio" | "profile.avatar"

type BioValue = PathValue<UserState, "profile.bio">
// → string
```

Default path depth is 10 levels. Use `PathDepth<T, N>` if you need different depth (exported from `stroid`).

---

## Feature Options Augmentation

For third-party plugins or custom features:

```ts
declare module "stroid" {
  interface FeatureOptionsMap {
    analytics: {
      trackName?: string
      enabled?: boolean
    }
  }
}

createStore("user", { name: "Ava" }, {
  features: {
    analytics: { trackName: "user_store", enabled: true }
  }
})
```

---

## `WriteResult`

Every write returns a structured result — no thrown errors on invalid input by default:

```ts
const result = setStore("user", "role", "unknown-role")

if (!result.ok) {
  switch (result.reason) {
    case "not-found":      // store doesn't exist
    case "validate":       // failed validate rule
    case "path":           // invalid path
    case "middleware":     // MIDDLEWARE_ABORT returned
    case "invalid-args":   // bad arguments
    case "lazy-uninitialized":  // lazy store not yet materialized
  }
}
```

---

## SSR Typed APIs

```ts
import type { StoreStateMap } from "stroid"
import { createStoreForRequest } from "stroid/server"

const stores = createStoreForRequest<StoreStateMap>((api) => {
  api.create("user", { name: session.name, role: "admin" })
  // api.create is fully typed: name must be keyof StoreStateMap
})
```

---

## Immer Integration

```ts
import { produce } from "immer"
import { registerMutatorProduce } from "stroid"

// Register once at app startup:
registerMutatorProduce(produce)

// Now mutators have structural sharing:
setStore("cart", draft => {
  draft.items.push(newItem)  // uses Immer's produce internally
})
```

Once registered, `setStore` mutators receive an Immer draft proxy and only changed nodes are cloned.

---

## Middleware Pattern

```ts
import { MIDDLEWARE_ABORT } from "stroid"

createStore("order", { items: [], status: "pending" }, {
  lifecycle: {
    middleware: [
      (ctx) => {
        // ctx.action: "set" | "reset" | "hydrate" | "replace"
        // ctx.prev, ctx.next, ctx.path
        // ctx.correlationId, ctx.traceContext (if configured)

        // Veto the write:
        if (ctx.action === "set" && ctx.next.items.length > 50) {
          return MIDDLEWARE_ABORT
        }

        // Transform the next value:
        return { ...ctx.next, updatedAt: Date.now() }

        // Pass through (return undefined or the same value):
      }
    ]
  }
})
```

---

## Suppress Loose-Type Warnings

If you intentionally use string store names without `StoreStateMap` augmentation:

```ts
configureStroid({ acknowledgeLooseTypes: true })
```

This suppresses the once-per-store dev warning about untyped store names.
