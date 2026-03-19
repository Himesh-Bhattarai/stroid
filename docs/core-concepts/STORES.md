# Core Concepts — Stores

> **Confidence: HIGH** — derived from `src/core/store-create.ts`, `src/core/store-write.ts`, `src/adapters/options.ts`.

---

## What Is a Store?

A store is a named slot in a registry that holds a single JavaScript value. The name is the address — it is how every other part of the system references the store.

```ts
createStore("user", { name: "Ava", role: "admin" })
```

That's it. The store is now available globally (or per-request in SSR) under the name `"user"`.

---

## Creating a Store

```ts
import { createStore, createStoreStrict } from "stroid"

// Returns StoreDefinition | undefined (undefined on failure — no throw)
const userStore = createStore("user", { name: "Ava" })

// Throws on failure — use when you want hard errors
const userStore = createStoreStrict("user", { name: "Ava" })
```

### Duplicate Names

If a store with the same name already exists, `createStore` returns `{ name }` without modifying the existing store. This is a silent no-op, not an error.

### Lazy Stores

A lazy store defers initialization until the store is first read.

```ts
createStore("config", () => expensiveCompute(), { lazy: true })
// ...later, when first accessed:
getStore("config")  // triggers lazy initialization
```

---

## Writing to a Store

Three write modes, all via `setStore`:

### Merge (object stores)

```ts
setStore("user", { role: "editor" })
// Result: { name: "Ava", role: "editor" }  ← shallow merge
```

### Path write

```ts
setStore("user", "role", "editor")
setStore("user", ["profile", "name"], "Kai")  // array path
```

Intermediate paths must exist unless `pathCreate: true` is set in store options.

### Mutator

```ts
setStore("cart", draft => {
  draft.items.push({ id: "1", price: 50 })
})
```

By default, the draft is a deep clone. If `registerMutatorProduce(produce)` is called with Immer's `produce`, the draft uses structural sharing.

### Full replacement

Use `replaceStore` (not `setStore`) to replace the entire store value:

```ts
replaceStore("user", { name: "Kai", role: "admin" })
```

---

## Reading a Store

```ts
import { getStore } from "stroid"

getStore("user")              // → { name: "Ava", role: "admin" } | null
getStore("user", "role")      // → "admin" | null
getStore("user", "profile.name")  // dot path
```

Returns `null` if the store does not exist or the path is not found.

---

## Scope

Every store has a `scope` that controls its lifetime and server behavior.

| Scope | Default? | Behavior |
|-------|----------|----------|
| `"request"` | ✓ | Scoped to a server request (via `createStoreForRequest`). In the browser, behaves like global. |
| `"global"` | — | Persists across requests. Triggers a SSR leak warning in dev unless intentional. |
| `"temp"` | — | Ephemeral. Persist, sync, and devtools are disabled automatically. |

The default scope is `"request"` (not `"global"`).

```ts
createStore("appConfig", { debug: false }, { scope: "global" })
```

---

## Validation

`validate` can be a function or a schema-compatible object (Zod, Yup, Valibot, etc.).

```ts
// Function validator
createStore("count", 0, {
  validate: (next) => typeof next === "number" && next >= 0
})

// Zod schema
import { z } from "zod"
const UserSchema = z.object({ name: z.string(), role: z.string() })

createStore("user", { name: "", role: "user" }, {
  validate: UserSchema  // stroid calls .safeParse internally
})
```

Validation runs on every write. Invalid writes are rejected (the store stays at its previous value).

---

## Lifecycle Hooks

```ts
createStore("cart", { items: [] }, {
  lifecycle: {
    onCreate:  (initial) => console.log("created", initial),
    onSet:     (prev, next) => console.log("changed"),
    onReset:   (prev, next) => console.log("reset"),
    onDelete:  (prev)       => console.log("deleted"),
  }
})
```

The top-level `onCreate`, `onSet`, etc. options are deprecated in favor of the `lifecycle` grouping.

---

## Middleware

Middleware intercepts every write and can transform or veto it.

```ts
import { MIDDLEWARE_ABORT } from "stroid"  // actually from features/lifecycle

createStore("cart", { items: [] }, {
  lifecycle: {
    middleware: [
      (ctx) => {
        // ctx.action: "set" | "reset" | "hydrate" | "replace"
        // ctx.prev, ctx.next, ctx.path
        if (ctx.next.items.length > 100) return MIDDLEWARE_ABORT
        return ctx.next  // or return undefined to pass through
      }
    ]
  }
})
```

Global middleware can be added via `configureStroid({ middleware: [...] })`.

---

## Snapshot Mode

Controls how subscriber callbacks receive store values.

| Mode | Behavior |
|------|----------|
| `"deep"` (default) | Deep clone + dev-freeze. Safest; most overhead. |
| `"shallow"` | Shallow clone of the top-level object. Faster for large objects where only top-level fields change. |
| `"ref"` | Live reference. No cloning. Fastest but dangerous — mutations propagate. |

```ts
createStore("largeList", [], { snapshot: "shallow" })

// Or globally:
configureStroid({ defaultSnapshotMode: "shallow" })
```

---

## Transactions (`setStoreBatch`)

```ts
setStoreBatch(() => {
  setStore("order", { id: "x", status: "pending" })
  setStore("cart",  { items: [] })
  setStore("ui",    "loading", false)
})
// All three commit atomically, or all three roll back.
```

Rules inside a batch:
- `createStore` is forbidden.
- `deleteStore` is forbidden.
- `hydrateStores` is forbidden.

---

## WriteResult

Every write operation returns a `WriteResult`:

```ts
const result = setStore("user", "name", "Kai")
if (!result.ok) {
  console.error("write failed:", result.reason)
  // reason: "not-found" | "validate" | "path" | "middleware" | "invalid-args" | "lazy-uninitialized"
}
```
