# Stroid

Named-store state management for JavaScript and React with optional power tools.

> Development branch notice (`v0.0.5`): `main` stays locked on the released `0.0.4` line. This branch tracks upcoming work, and `dist/` is release-managed, so it may be absent here or still reflect the last released `0.0.4` build until the next release is prepared.

Stroid keeps the API small: create a store, update it, read it. Persistence, async caching, cross-tab sync, middleware, schema validation, history, and React hooks are configured per store instead of bolted on later.

This package is ESM-only, tree-shakeable, side-effect free, and ships with zero runtime dependencies.

## Install

```bash
npm install stroid
```

## Quick Example

```js
import { createStore, setStore } from "stroid/core"
import { useStore } from "stroid/react"

createStore("user", { name: "Eli", theme: "dark" })

function Profile() {
  const name = useStore("user", "name")
  return <h1>Hello, {name}</h1>
}

setStore("user", "theme", "light")
```

The core path API uses `storeName` and `path` separately:

- `setStore("user", "name", "Jo")`
- `getStore("user", "name")`
- `useStore("user", "name")`

## What Ships

- Core store primitives: `createStore`, `setStore`, `getStore`, `resetStore`, `createComputed`
- React hooks: `useStore`, `useSelector`, `useStoreStatic`, `useAsyncStore`, `useFormStore`
- Async helpers: `fetchStore`, `refetchStore`, `enableRevalidateOnFocus`
- Per-store features: `persist`, `sync`, middleware, validator/schema, devtools, history
- Utility helpers: selectors, metrics, testing helpers, entity/list/counter presets, SSR hydrate helpers
- Runtime inspection via `stroid/runtime-tools` (`listStores`, `getStoreMeta`, `getMetrics`)
- Lazy stores for expensive initial state (see below)
- Store handles with autocomplete: `store("user")` returns `{ name: "user" }` for strongly typed calls
- Store handles work across core and async APIs (for example, `fetchStore(store("user"), ...)`)
- `createStore` returns `undefined` on failure; use `createStoreStrict(...)` to throw instead, or pass literal names / `store("name")` handles into setters

## Highlights

- Dot-path reads and writes with path validation
- Draft-style mutator updates
- Persistence with custom drivers, migrations, and recovery hooks
- Async caching with TTL, dedupe, retries, and focus/online revalidation
- BroadcastChannel sync with conflict resolution and payload size guardrails
- No Provider required for React usage

## Store handles and namespaces

`store(name)` and `namespace(ns)` are small helpers that return typed handles for safer calls:

```ts
import { store, namespace, setStore } from "stroid/core"
import { fetchStore } from "stroid/async"

const user = store("user")
setStore(user, "name", "Ava")
await fetchStore(user, "https://api.example.com/user")

const admin = namespace("admin")
admin.create("session", { token: null })
```

### Typed computed dependencies

`createComputed` accepts store handles so dependency values are typed:

```ts
import { createComputed, store } from "stroid";

const user = store<"user", { name: string }>("user");
const prefs = store<"prefs", { theme: string }>("prefs");

createComputed("userView", [user, prefs], (userState, prefsState) => ({
  name: userState?.name ?? "Anonymous",
  theme: prefsState?.theme ?? "light",
}));
```

## Type-safe store names (TypeScript)

If you want compile-time checking of store names and state, augment `StrictStoreMap`:

```ts
// src/stroid.d.ts
import type { UserState } from "./types";

declare module "stroid" {
  interface StrictStoreMap {
    user: UserState;
    cart: { items: string[] };
  }
}

// If you import from "stroid/core", add this too.
declare module "stroid/core" {
  interface StrictStoreMap {
    user: UserState;
    cart: { items: string[] };
  }
}
```

Now `createStore("user", ...)`, `setStore("user", ...)`, and `store("user")` are fully typed, and unknown store names are a type error.

## Custom async store shapes

`fetchStore` can write into custom shapes via `stateAdapter`:

```ts
import { createStore } from "stroid";
import { fetchStore } from "stroid/async";

createStore("customAsync", { items: [], loading: false, error: null });

await fetchStore("customAsync", "/api/items", {
  stateAdapter: ({ next, set }) => {
    set((draft: any) => {
      draft.loading = next.loading;
      draft.error = next.error;
      if (next.status === "success" && next.data) {
        draft.items = next.data as any[];
      }
    });
  },
});
```

When `stateAdapter` is provided, the backing store must already exist.

## Lazy stores

If your initial state is expensive to build, pass a factory with `{ lazy: true }`:

```ts
createStore(
  "heavyReport",
  () => buildLargeInitialState(),
  { lazy: true }
)
// the factory runs only on first access to "heavyReport"
```

> Note: lazy factories run only after the store is first read/updated. If you see `undefined` reads, make sure you haven’t disabled validation that would block materialization.

## Performance knobs

For large or frequently updated stores, you can trade some safety for speed:

```ts
createStore("feed", initialFeed, {
  snapshot: "shallow", // or "ref"
  persist: { checksum: "none" },
});
```

Notes:
- `snapshot: "shallow"` only clones the top level; nested objects are shared.
- `snapshot: "ref"` returns the live store reference (no cloning).
- `persist.checksum: "none"` skips integrity hashing during save/load.

## Global middleware

To intercept every store write from one place, register global middleware:

```ts
import { configureStroid } from "stroid";

configureStroid({
  middleware: [
    ({ name, next }) => {
      if (name === "audit") return next;
      return next;
    },
  ],
});
```

Store-level middleware runs first; global middleware runs last.

## Import paths that enable features

The root import (`import { createStore } from "stroid"`) is side-effect free and does **not** register optional features. To use persistence, sync, or devtools you must import their side-effect modules once in your app:

```ts
import "stroid/persist";
import "stroid/sync";
import "stroid/devtools";
```

If you prefer explicit paths, you can also import from subpaths (`stroid/core`, `stroid/runtime-tools`, etc.), but remember to include the feature side-effect imports when you need them.

> Important: If you forget these side-effect imports, Stroid throws by default to avoid silent feature failures. To opt out (not recommended), call `configureStroid({ strictFeatures: false })`.

## Persistence and encryption

The default `encrypt`/`decrypt` functions are identity (no encryption). If you store sensitive data, provide real encryption functions:

```ts
createStore("secrets", { token: "..." }, {
  persist: {
    encrypt: (plaintext) => encryptWithYourKey(plaintext),
    decrypt: (ciphertext) => decryptWithYourKey(ciphertext),
  },
});
```

The persist feature warns in dev if your `encrypt` is identity, but the default is also identity—don’t rely on defaults for sensitive data.
The default crypto marker is only for configuration detection; it does not provide any encryption.

## SSR warning

In production server environments (`NODE_ENV=production` and no `allowSSRGlobalStore`/`scope:"global"`), `createStore` returns `undefined` to prevent cross-request leaks. Handle this case or use `createStoreForRequest` inside each request scope.

## Validation option behavior

`validate` accepts:

- A function: `(next) => boolean | nextValue`
- A schema-like object (Zod/Yup/Joi/etc.)
- A boolean (legacy): `true` is a no-op, `false` blocks all writes

The boolean case exists for backward compatibility and is **not recommended**. Prefer a function or schema for explicit behavior.

## Docs

- [The Book](./docs/README.md)
- [Getting Started](./docs/02-getting-started.md)
- [Core API](./docs/04-createStore.md)
- [React](./docs/12-react.md)
- [Async](./docs/13-async.md)
- [Persistence](./docs/14-persist.md)
- [Sync](./docs/15-sync.md)
- [Testing](./docs/20-testing.md)
- [Debugging Guide](./DEBUGGING.md)
- [Roadmap](./docs/24-roadmap.md)

## Package Entry Points

- `stroid` exports the full public API
- `stroid/core` exports the core store APIs
- `stroid/react` exports the React hooks
- `stroid/async` exports async helpers
- `stroid/testing` exports test helpers

## Notes

- React is a peer dependency (`>=18`)
- Node `>=18` is required
- `v0.0.5` is the active development branch; `dist/` is release-managed and may be absent here or lag behind in-progress source changes until the next release build
- Planned or not-yet-implemented ideas belong in the roadmap, not the API docs
- Sync uses `BroadcastChannel` without origin authentication. Any same-origin tab can inject state; treat it as a trusted-origin channel.
- The feature plugin API (persist/sync/devtools registration) is internal and subject to change; third-party plugins are not supported yet.

## License

MIT @Himesh-Bhattarai
