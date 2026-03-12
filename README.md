# Stroid

Compact, batteries-included state management for JavaScript and React.

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
- Lazy stores for expensive initial state (see below)
- Store handles with autocomplete: `store("user")` returns `{ name: "user" }` for strongly typed calls
- `createStore` returns `undefined` on failure; prefer passing literal names or `store("name")` into setters, or null‑check the return value first

## Highlights

- Dot-path reads and writes with path validation
- Draft-style mutator updates
- Persistence with custom drivers, migrations, and recovery hooks
- Async caching with TTL, dedupe, retries, and focus/online revalidation
- BroadcastChannel sync with conflict resolution and payload size guardrails
- No Provider required for React usage

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

## Import paths that enable features

The root import (`import { createStore } from "stroid"`) is side-effect free and does **not** register optional features. To use persistence, sync, or devtools you must import their side-effect modules once in your app:

```ts
import "stroid/persist";
import "stroid/sync";
import "stroid/devtools";
```

If you prefer explicit paths, you can also import from subpaths (`stroid/core`, `stroid/runtime-tools`, etc.), but remember to include the feature side-effect imports when you need them.

> Important: If you forget these side-effect imports, the features are silently disabled (only a dev-mode warning is emitted). This is the #1 onboarding footgun—add the imports near your app entry point.

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

## License

MIT
