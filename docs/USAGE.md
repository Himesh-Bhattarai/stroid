# Stroid Usage Guide

This guide covers the full feature set. It lives in `docs/` and is **not** published in the npm package.

## 60-second quick start
```bash
npm install stroid
```
```js
// Core
import { createStore, setStore, getStore } from "stroid/core";
createStore("counter", { count: 0 });
setStore("counter", "count", 1);
console.log(getStore("counter", "count")); // 1

// React
import { useStore } from "stroid/react";
const count = useStore("counter", "count");
```

## Imports & Packaging
- ESM-only. Subpaths: `stroid/core`, `stroid/react`, `stroid/async`, `stroid/testing`.
- Current bundles share a common internal chunk; true per-feature isolation planned for v1.1.
- Peer deps: React >=18 (for hooks). Use `stroid/core` for non-React.

## Limitations (read first)
- ESM-only; shared internal chunk across subpaths (isolation planned v1.1).
- Persistence is synchronous; large states can block.
- History diffs are shallow; deep diffs need custom middleware.
- Dev warnings/logs guarded by `isDev()`, but dead-branch removal depends on your minifier.

## Gotchas
- `setStore` path writes require the path to exist (no auto-create).
- Using `useStore` without a selector/path subscribes to the whole store and re-renders on every change.
- `fetchStore` cacheKey is per `name:cacheKey`; using the same cacheKey for different URLs will reuse cached data.
- Date/Map/Set are sanitized: Date → ISO string, Map → object, Set → array. Re-wrap on read (`new Date(value)`, etc.).

## Core API
### createStore(name, initial, options?)
Creates/overwrites a store. Initial state is deep-cloned.

Options (one per line):
- `persist`: boolean | "session" | config (driver/key/serialize/deserialize/encrypt/decrypt).
- `devtools`: boolean (Redux DevTools).
- `middleware`: array of `(ctx) => next | void`.
- Lifecycle hooks: `onSet`, `onReset`, `onDelete`, `onCreate`, `onError`.
- Validation: `validator` (boolean return) or `schema` (zod/yup/etc).
- Migrations: `migrations`, `version` (number).
- Redaction: `redactor` (state -> state before persist/sync).
- History: `historyLimit` (default 50).
- Sync: `sync` boolean | { conflictResolver }.
- SSR: `allowSSRGlobalStore` (defaults to false in prod Node).

```js
import { createStore } from "stroid/core";
createStore("user", { name: "Alex", theme: "dark" }, { devtools: true, persist: true });
```

### setStore
- Path string/array: shallow-clones along the path; requires existing path (no auto-create).
- Mutator: receives a cloned draft.
- Object merge: shallow merge at root only.

```js
setStore("user", "theme", "light");
setStore("user", draft => { draft.loggedIn = true; });
setStore("user", { role: "admin" }); // shallow merge
```

### getStore / resetStore / mergeStore / deleteStore / clearAllStores / setStoreBatch
- `getStore(name, path?)` returns clone; primitives returned as-is.
- `mergeStore` shallow-merges objects only.
- `setStoreBatch(() => { ... })` batches notifications.

## React Hooks (stroid/react)
- `useStore(name, path? | selector?, equality?)`: subscribes; selector/field narrows updates. Dev warns on full-store subscribe.
- `useStoreField(name, path)`: path-specific helper.
- `useSelector(name, selector, equality?)`: derived selection.
- `useAsyncStore(name)`: convenience for async state shape (returns `{ data, loading, error, status, cached }` from `fetchStore`).
- `useStoreStatic(name, path?)`: read once, no subscribe (RSC-friendly).
- `useFormStore(name, field)`: `{ value, onChange }` binder to wire inputs.

Perf: prefer `useSelector` or `useStoreField` for large stores; memoize selectors to avoid resubscribes.

## Async (stroid/async)
- `fetchStore(name, url|promise, { ttl, staleWhileRevalidate, dedupe, retry, retryDelay, retryBackoff, transform, onSuccess, onError, signal, cacheKey })`
- `refetchStore(name)` reuses last call.
- `enableRevalidateOnFocus(name?)` hooks focus/online to refetch (name or all).
- State shape: `{ data, loading, error, status, cached }`.
- Dedup keyed by `name:cacheKey`; LWW via request version; abort supported if signal provided.

## Persistence
Options via `persist`:
- `true` → localStorage; `"session"` → sessionStorage; custom config `{ driver, key, serialize/deserialize, encrypt/decrypt }`.
- Checksum + optional migrations/version; schema validation on load.
- Collision warning when two stores share a key.
- Synchronous driver calls; choose fast drivers or wrap with debounce if needed.

## Sync
- Enable per store: `{ sync: true }` or `{ sync: { conflictResolver } }`.
- Uses BroadcastChannel if available; falls back to no-op otherwise.
- Default LWW uses `Date.now()`; clock skew can reorder updates.
- `conflictResolver({ local, incoming, localUpdated, incomingUpdated })` can merge or ignore.

## SSR
- Prefer `createStoreForRequest` on server; `hydrateStores(snapshot)` on client.
- Blocked in prod Node when using global createStore unless `allowSSRGlobalStore: true`.
- Hydration: objects are shallow-merged; primitives replaced. Hydrate before first render.

## DevTools / History / Metrics
- Enable Redux DevTools with `devtools: true`.
- History bounded by `historyLimit` (default 50), shallow diffs only.
- Metrics: notify counts/timings stored in meta; async metrics via `getAsyncMetrics`.

## Types
- `StoreDefinition<Name, State>` for typed store refs.
- `Path<State>` and `PathValue<State, P>` give typed path access when using StoreDefinition overloads.
- String-name overloads are runtime-only (less type safety).

## Subpath Imports
- `stroid/core`: core store APIs (no presets/hooks/async).
- `stroid/react`: hooks only.
- `stroid/async`: async helpers.
- `stroid/testing`: testing utilities.
- Root `stroid` exports everything.

## Examples (brief)
```js
// Core update
setStore("prefs", "theme", "dark");
setStore("prefs", draft => { draft.fontSize = 16; });

// Selector hook
const theme = useStore("prefs", "theme");
const greeting = useSelector("user", u => `Hi ${u.name}`);

// Async
await fetchStore("todos", "/api/todos", { ttl: 30_000, staleWhileRevalidate: true, cacheKey: "list" });
enableRevalidateOnFocus("todos");

// Persistence
createStore("auth", { token: null }, { persist: { key: "auth", driver: myDriver, encrypt: enc, decrypt: dec } });

// useAsyncStore
const { data, loading, error } = useAsyncStore("todos");

// useFormStore
const { value, onChange } = useFormStore("profile", "email");
```
