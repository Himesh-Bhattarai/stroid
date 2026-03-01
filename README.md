# Stroid

> Compact, batteries-included state management for JavaScript & React.

Mutable-friendly updates · Selectors · Persistence · Async caching · Sync · Drop-in presets — all in one ergonomic package.

[![npm version](https://img.shields.io/npm/v/stroid)](https://www.npmjs.com/package/stroid)
[![npm downloads](https://img.shields.io/npm/dm/stroid)](https://www.npmjs.com/package/stroid)
[![bundlephobia minzip](https://img.shields.io/bundlephobia/minzip/stroid)](https://bundlephobia.com/package/stroid)
[![Codecov](https://codecov.io/gh/Himesh-Bhattarai/stroid/branch/main/graph/badge.svg)](https://app.codecov.io/gh/Himesh-Bhattarai/stroid)
[![GitHub stars](https://img.shields.io/github/stars/Himesh-Bhattarai/stroid?style=social)](https://github.com/Himesh-Bhattarai/stroid/stargazers)
[![open issues](https://img.shields.io/github/issues/Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid/issues)
[![open PRs](https://img.shields.io/github/issues-pr/Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid/pulls)
[![license](https://img.shields.io/github/license/Himesh-Bhattarai/stroid)](./LICENSE)
[![ESM only](https://img.shields.io/badge/ESM-only-blue)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
[![tree-shakeable](https://img.shields.io/badge/tree--shakeable-yes-brightgreen)](https://bundlephobia.com/package/stroid)
[![side-effect free](https://img.shields.io/badge/side--effect%20free-yes-brightgreen)](https://bundlephobia.com/package/stroid)
[![no dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](https://www.npmjs.com/package/stroid?activeTab=dependencies)

Jump to: [Installation](#installation) | [Quick Start](#quick-start) | [Core API](#core-api) | [React Hooks](#react-hooks) | [Persistence](#persistence) | [Async Helper](#async-helper) | [Testing](#testing) | [Roadmap](#roadmap)

---

## Package Stats

| Metric | Value |
|---|---|
| Version | `0.0.2` |
| Maintainer | [@himesh.hcb](https://www.npmjs.com/~himesh.hcb) |
| Dependencies | **0** |
| Bundle size (minified) | **22.7 kB** |
| Bundle size (minified + gzipped) | **8.6 kB** |
| Unpacked size | **43 kB** |
| Download time — Slow 3G | **171 ms** |
| Download time — Emerging 4G | **10 ms** |
| Vulnerability score | **100 / 100** |
| Quality score | **83 / 100** |
| Maintenance score | **86 / 100** |
| License score | **100 / 100** |

> Verified on [BundlePhobia](https://bundlephobia.com/package/stroid) · [Socket.dev](https://socket.dev/npm/package/stroid)

---

## Table of Contents

- [Package Stats](#package-stats)
- [Why Stroid?](#why-stroid)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Subpath Imports](#subpath-imports)
- [Core API](#core-api)
  - [createStore](#createstore)
  - [getStore](#getstore)
  - [setStore](#setstore)
  - [mergeStore](#mergestore)
  - [resetStore](#resetstore)
  - [deleteStore](#deletestore)
  - [setStoreBatch](#setstorebatch)
  - [subscribeWithSelector](#subscribewithselector)
  - [createStoreForRequest](#createstoreforresquest)
- [React Hooks](#react-hooks)
  - [useStore](#usestore)
  - [useSelector](#useselector)
  - [useAsyncStore](#useasyncstore)
  - [useStoreField](#usestorefield)
  - [useFormStore](#useformstore)
  - [useStoreStatic](#usestorestatic)
- [Nested Updates](#nested-updates)
  - [Chain API](#chain-api)
  - [Path String / Array](#path-string--array)
- [Async Helper](#async-helper)
- [Persistence](#persistence)
- [Sync via BroadcastChannel](#sync-via-broadcastchannel)
- [Presets](#presets)
- [DevTools & Metrics](#devtools--metrics)
- [SSR / Next.js](#ssr--nextjs)
- [Testing](#testing)
- [Validation & Middleware](#validation--middleware)
- [TypeScript](#typescript)
- [Limitations & Gotchas](#limitations--gotchas)
- [Common Problems & Solutions](#common-problems--solutions)
- [Roadmap](#roadmap)
- [Versioning](#versioning)

---

## Why Stroid?

**Why we built it this way**
- One consistent API for every state need so teams avoid multiple mental models.
- No providers, no boilerplate, no magic — setup stays explicit and debuggable.
- Batteries included but opt-out capable; features like persistence or sync can be disabled per store.
- Mutable draft updates keep developer ergonomics high while producing safe immutable results.
- Tiny core, extensible via middleware instead of hidden globals.

Clear design principles make the trade-offs obvious and help developers decide when Stroid is the right fit.

Most state libraries make you choose between simplicity and power. Stroid gives you both — mutable-friendly updates, built-in async/SWR, persistence with migrations, tab sync, SSR safety, drop-in presets, and ESM subpath imports, all in one package with no plugins required.

---

## Installation

```bash
# npm
npm install stroid

# yarn
yarn add stroid

# pnpm
pnpm add stroid
```

**Requirements:** Node 18+ · ESM-only (no CommonJS)

---

## Quick Start

```js
import { createStore, setStore, useStore } from "stroid";

// 1. Create a store with optional devtools + persistence
createStore("user", { name: "Alex", theme: "dark" }, { devtools: true, persist: true });

// 2. Update with a mutable-friendly draft
setStore("user", (draft) => {
  draft.name = "Jordan";
});

// 3. Read in a React component
function Profile() {
  const name = useStore("user", "name");
  return <h1>{name}</h1>;
}
```

---

## Subpath Imports

Stroid is ESM-only and ships focused subpaths to keep bundles lean.

| Subpath | Contents |
|---|---|
| `stroid` | Everything (convenience re-export) |
| `stroid/core` | `createStore`, `getStore`, `setStore`, `mergeStore`, `resetStore`, `deleteStore`, `setStoreBatch`, `subscribeWithSelector`, `createStoreForRequest` |
| `stroid/react` | All React hooks (`useStore`, `useSelector`, `useAsyncStore`, …) |
| `stroid/async` | Async helper with SWR, TTL, dedupe, retries, abort |
| `stroid/testing` | `createMockStore`, `resetAllStoresForTest` |

> **Note:** Subpath imports currently share an internal chunk. True per-feature isolation is planned for **v1.1**.

For non-React / Node.js usage, prefer `stroid/core`.

---

## Core API

### `createStore`

```ts
createStore(name: string, initialState: object, options?: StoreOptions): void
```

Creates a named store. Safe to call multiple times — calling it again with an existing name is a no-op (state is preserved).

```js
import { createStore } from "stroid/core";

createStore("settings", { theme: "light", language: "en" }, {
  devtools: true,   // connect to Redux DevTools
  persist: true,    // persist to localStorage (or custom adapter)
});
```

**Options**

| Option | Type | Default | Description |
|---|---|---|---|
| `devtools` | `boolean` | `false` | Enable Redux DevTools bridge |
| `persist` | `boolean \| PersistOptions` | `false` | Persist state across page loads |
| `sync` | `boolean \| SyncOptions` | `false` | Sync state across browser tabs via BroadcastChannel |
| `schema` | `ZodSchema \| YupSchema \| predicate` | — | Validate state shape on every update |
| `validator` | `boolean` | `false` | Enable built-in validator (requires `schema`) |
| `historyLimit` | `number` | `50` | Max shallow diffs to keep for time-travel in DevTools |
| `middleware` | `Middleware[]` | `[]` | Array of middleware hooks — see [Validation & Middleware](#validation--middleware) |
| `allowSSRGlobalStore` | `boolean` | `false` | Suppress SSR warning for global stores |

---

### `getStore`

```ts
getStore(name: string): object
getStore(name: string, path: string): any
```

Returns a **snapshot** (plain object) of the current store state, or a specific value at a dot-notation path.

```js
import { getStore } from "stroid/core";

const state = getStore("user");               // full clone
const theme = getStore("user", "profile.theme"); // "dark"
```

---

### `setStore`

```ts
setStore(name: string, updater: object | ((draft: Draft) => void)): void
setStore(name: string, path: string | string[], value: any): void
```

Replaces or mutably updates the store state. Supports three calling styles:

```js
import { setStore } from "stroid/core";

// 1. Object update (shallow merge)
setStore("settings", { theme: "dark" });

// 2. Mutable draft (Immer-style)
setStore("settings", (draft) => {
  draft.theme = "dark";
  draft.language = "fr";
});

// 3. Path update — dot string or array (path must already exist)
setStore("user", "profile.name", "Kai");
setStore("user", ["profile", "name"], "Kai");
```

For readable chained access on deeply nested state, see the [Chain API](#chain-api).

---

### `mergeStore`

```ts
mergeStore(name: string, partial: object): void
```

Deep-merges a partial object into the store.

```js
import { mergeStore } from "stroid/core";

mergeStore("user", { profile: { city: "Kathmandu" } });
```

---

### `resetStore`

```ts
resetStore(name: string): void
```

Resets the store to its original `initialState`.

```js
import { resetStore } from "stroid/core";

resetStore("user");
```

---

### `deleteStore`

```ts
deleteStore(name: string): void
```

Completely removes the store and all its subscribers.

```js
import { deleteStore } from "stroid/core";

deleteStore("temp_store");
```

---

### `clearAllStores` / `hasStore` / `listStores`

Utility helpers for store introspection and bulk teardown.

```js
import { clearAllStores, hasStore, listStores } from "stroid/core";

hasStore("user");       // true | false
listStores();           // ["user", "settings", ...]
clearAllStores();       // removes every store and all subscribers
```

> `clearAllStores` is destructive — use `resetAllStoresForTest` from `stroid/testing` in tests instead.

---

### `setStoreBatch`

```ts
setStoreBatch(fn: () => void): void
```

Runs multiple store updates in a single batch — subscribers are notified only **once** at the end.

```js
import { setStoreBatch, setStore, mergeStore } from "stroid/core";

setStoreBatch(() => {
  setStore("user", { name: "Jordan" });
  mergeStore("settings", { theme: "dark" });
});
```

---

### `subscribeWithSelector`

```ts
subscribeWithSelector(
  name: string,
  selector: (state: object) => any,
  callback: (value: any) => void
): () => void
```

Subscribe to a specific slice of state. Returns an `unsubscribe` function.

```js
import { subscribeWithSelector } from "stroid/core";

const unsub = subscribeWithSelector(
  "user",
  (state) => state.name,
  (name) => console.log("Name changed:", name)
);

// Later:
unsub();
```

---

### `createStoreForRequest`

```ts
createStoreForRequest(name: string, initialState: object): Store
```

Creates a **request-scoped** store, safe for SSR environments (Next.js, Remix, etc.). The store is isolated per request and does not pollute global state.

```js
import { createStoreForRequest, setStore, getStore } from "stroid/core";

// Inside a Next.js API route or Server Component
const store = createStoreForRequest("req_store", { token: null });
setStore("req_store", { token: "abc123" });
console.log(getStore("req_store")); // { token: "abc123" }
```

---

## React Hooks

All hooks live in `stroid/react` (or the main `stroid` entry).

> **Rule:** Hooks must only be called inside React function components. Calling them in Node.js or class components will throw.

---

### `useStore`

```ts
useStore(name: string, field?: string): any
```

Subscribes to the full store — or a single top-level field — and re-renders on changes.

```jsx
import { useStore } from "stroid/react";

function Profile() {
  // ⚠️ Dev warning: subscribing to the whole store can cause extra re-renders
  const user = useStore("user");

  // ✅ Preferred: subscribe to a specific field
  const name = useStore("user", "name");

  return <p>{name}</p>;
}
```

> In development, subscribing to the whole store (no `field`) emits a warning. Use `useSelector` or pass a field name for fine-grained subscriptions.

---

### `useSelector`

```ts
useSelector(name: string, selector: (state: object) => any): any
```

Subscribes to a derived value. Only re-renders when the selected value changes.

```jsx
import { useSelector } from "stroid/react";

function ThemeBadge() {
  const isDark = useSelector("settings", (s) => s.theme === "dark");
  return <span>{isDark ? "🌙 Dark" : "☀️ Light"}</span>;
}
```

---

### `useAsyncStore`

```ts
useAsyncStore(name: string): { data: any, loading: boolean, error: string | null, status: string, cached: boolean }
```

Reads the async state shape from a store. Pair with `fetchStore` from `stroid/async` for full SWR/TTL support.

```jsx
import { useAsyncStore } from "stroid/react";

function UserCard() {
  const { data, loading, error, status, cached } = useAsyncStore("async_user");

  if (loading) return <p>Loading… {cached && "(showing cached)"}</p>;
  if (error) return <p>Error: {error}</p>;
  return <p>{data?.name}</p>;
}
```

| Field | Description |
|---|---|
| `data` | The resolved value, or `null` |
| `loading` | `true` while a fetch is in flight |
| `error` | Error message string, or `null` |
| `status` | `"idle"` \| `"loading"` \| `"success"` \| `"error"` |
| `cached` | `true` if data was served from cache (stale-while-revalidate) |

---

### `useStoreField`

```ts
useStoreField(name: string, field: string): [value: any, setter: (v: any) => void]
```

Returns a `[value, setter]` tuple for a single field — similar to `useState`.

```jsx
import { useStoreField } from "stroid/react";

function ThemeToggle() {
  const [theme, setTheme] = useStoreField("settings", "theme");
  return (
    <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      Toggle Theme
    </button>
  );
}
```

---

### `useFormStore`

```ts
useFormStore(name: string, path: string): { value: any, onChange: (e: ChangeEvent) => void }
```

Lightweight input binding backed by a store field. Returns `value` and `onChange` — wire directly to an `<input>`.

```jsx
import { useFormStore } from "stroid/react";

createStore("profile", { email: "", bio: "" });

function ProfileForm() {
  const emailField = useFormStore("profile", "email");
  const bioField = useFormStore("profile", "bio");

  return (
    <form>
      <input type="email" {...emailField} />
      <textarea {...bioField} />
    </form>
  );
}
```

---

### `useStoreStatic`

```ts
useStoreStatic(name: string): object
```

Returns the store state **without** subscribing. The component will **not** re-render on changes. Useful for reading state inside event handlers.

```jsx
import { useStoreStatic } from "stroid/react";

function SubmitButton() {
  const state = useStoreStatic("form");

  const handleSubmit = () => {
    // Reads latest state at call time, no subscription needed
    console.log(state.email);
  };

  return <button onClick={handleSubmit}>Submit</button>;
}
```

---

## Nested Updates

Stroid gives you three ways to update deeply nested state. Pick whichever fits your style.

---

### Chain API

Import `chain` from `stroid/core` (or the root `stroid` entry) for a fluent, readable API when working with deeply nested paths.

```js
import { chain, createStore } from "stroid/core";

createStore("user", { profile: { name: "Ana", theme: "light" } });

// Write a single field
chain("user").nested("profile").target("name").set("Eli");

// Read a single field
const name = chain("user").nested("profile").target("name").value;

// Write an entire branch
chain("user").nested("profile").set({ name: "Jo", theme: "dark" });

// Read an entire branch
const profile = chain("user").nested("profile").value;
```

**Behaviour & rules**

| Rule | Detail |
|---|---|
| Keys must be non-empty strings | Empty keys (`""`) are rejected with a warning |
| Paths must already exist | Chain does **not** auto-create missing keys — use `mergeStore` to add new keys first |
| Store must exist | If the store hasn't been created yet, chain warns and no-ops until it exists |
| `target()` requires a key | Calling `.target()` without an argument warns and no-ops |

---

### Path String / Array

Pass a dot-notation string or an array of keys as the second argument to `setStore` for a quick one-liner update.

```js
import { setStore } from "stroid/core";

// Dot-notation string
setStore("user", "profile.name", "Kai");

// Array path — useful when keys contain dots
setStore("user", ["profile", "name"], "Kai");
```

Both forms are equivalent and follow the same rules as the Chain API — the path must already exist in the store.

---

**Choosing the right approach**

| Approach | Best for |
|---|---|
| Draft updater `(draft) => {}` | Multiple fields at once, conditional logic |
| `chain()` | Readable single-field reads/writes in complex nested structures |
| Path string / array | Quick one-liner updates in scripts or handlers |

---

## Async Helper

The async helper (`stroid/async`) wraps fetch calls with SWR-style caching, deduplication, retries, and abort support. Use `useAsyncStore` in React to read the result reactively.

```js
import { fetchStore, refetchStore, enableRevalidateOnFocus } from "stroid/async";

// Fetch and cache into a store
await fetchStore("todos", "/api/todos", {
  ttl: 30_000,               // Cache fresh for 30 seconds
  staleWhileRevalidate: true, // Serve stale data while refreshing in background
  dedupe: true,              // Deduplicate concurrent requests with same cacheKey
  retry: 3,                  // Retry on failure
  retryDelay: 500,           // ms between retries
  retryBackoff: true,        // Exponential backoff
  cacheKey: "list",          // Dedupe key — defaults to store name
  transform: (data) => data.items, // Transform response before storing
  onSuccess: (data) => console.log("Loaded:", data),
  onError: (err) => console.error("Failed:", err),
  signal: abortController.signal, // Abort support
});

// Re-run the last fetch (uses last URL + options)
await refetchStore("todos");

// Optionally revalidate when the window regains focus or comes back online
enableRevalidateOnFocus("todos");
```

**Options**

| Option | Type | Default | Description |
|---|---|---|---|
| `ttl` | `number` (ms) | `0` | How long cached data stays fresh |
| `staleWhileRevalidate` | `boolean` | `false` | Serve stale data while fetching fresh |
| `dedupe` | `boolean` | `true` | Deduplicate in-flight requests by `name:cacheKey` |
| `retry` | `number` | `0` | Number of retry attempts on error |
| `retryDelay` | `number` (ms) | `0` | Delay between retries |
| `retryBackoff` | `boolean` | `false` | Exponential backoff on retries |
| `cacheKey` | `string` | store name | Dedupe key — reusing the same key with different URLs reuses the cache |
| `transform` | `(data) => any` | — | Transform response before writing to store |
| `onSuccess` | `(data) => void` | — | Called after a successful fetch |
| `onError` | `(err) => void` | — | Called after a failed fetch |
| `signal` | `AbortSignal` | — | Abort the request |

> **Note:** Dedupe is keyed by `name:cacheKey`. If you reuse a `cacheKey` with different URLs, the cache from the first call will be returned.

---

## Persistence

Enable persistence by passing `persist: true` (uses `localStorage` by default), `"session"` for `sessionStorage`, or a full options object.

```js
// Shorthand — localStorage
createStore("user", { name: "Alex" }, { persist: true });

// Shorthand — sessionStorage
createStore("token", { value: null }, { persist: "session" });

// Full options
createStore("auth", { token: null }, {
  persist: {
    key: "auth_v2",                    // Storage key (default: store name)
    driver: localStorage,              // Custom storage driver
    version: 2,                        // Schema version — triggers migration on mismatch
    encrypt: (str) => myEncrypt(str),  // Optional encryption
    decrypt: (str) => myDecrypt(str),  // Optional decryption
    migrate: (oldState, oldVersion) => {
      if (oldVersion === 1) return { ...oldState, role: "user" };
      return oldState;
    },
  }
});
```

**Custom Driver**

Any object implementing `getItem`, `setItem`, and `removeItem` works as a driver:

```js
createStore("prefs", initialState, {
  persist: {
    driver: {
      getItem: (key) => myAsyncStorage.get(key),
      setItem: (key, value) => myAsyncStorage.set(key, value),
      removeItem: (key) => myAsyncStorage.remove(key),
    }
  }
});
```

> ⚠️ **Gotchas**
> - Persistence is **synchronous** — large states can block the main thread.
> - State is validated against `schema` on load if one is provided; invalid persisted state triggers `onError`.
> - Stroid warns on storage key collisions across stores.

---

## Sync via BroadcastChannel

Keep multiple browser tabs in sync automatically. Enable per-store with `sync: true` or pass options for conflict resolution.

```js
// Simple — last write wins
createStore("cart", { items: [] }, { sync: true });

// With conflict resolver
createStore("cart", { items: [] }, {
  sync: {
    conflictResolver: ({ local, incoming }) => incoming // always prefer incoming
  }
});
```

> **Notes**
> - Falls back to a no-op silently if `BroadcastChannel` is not available (e.g. older browsers).
> - The default conflict strategy is **last-write-wins** using `Date.now()` — clock skew between tabs can cause unexpected results. Use a custom `conflictResolver` for critical data.

---

## Presets

Presets are factory helpers that wire up common store patterns for you.

### Counter

```js
import { createCounterStore } from "stroid";

const counter = createCounterStore("score", { initial: 0, step: 1 });

counter.increment();
counter.decrement();
counter.reset();
console.log(counter.get()); // 0
```

### List

```js
import { createListStore } from "stroid";

const todos = createListStore("todos");

todos.add({ id: 1, text: "Buy milk" });
todos.remove(1);         // by id
todos.update(1, { text: "Buy oat milk" });
console.log(todos.get()); // []
```

### Entity

```js
import { createEntityStore } from "stroid";

const users = createEntityStore("users", { idField: "id" });

users.upsert({ id: "u1", name: "Alex" });
users.remove("u1");
```

---

## DevTools & Metrics

Pass `devtools: true` to connect a store to the [Redux DevTools Extension](https://github.com/reduxjs/redux-devtools). Every `setStore` / `mergeStore` call is recorded as a named action for time-travel debugging.

```js
createStore("user", initialState, {
  devtools: true,
  historyLimit: 100,  // Number of shallow diffs to keep (default: 50)
});
```

> **Note:** History diffs are **shallow only** — deeply nested changes are captured at the top level.

**Async Metrics**

Fetch counts and timings are tracked automatically in store meta. Read them with `getAsyncMetrics`:

```js
import { getAsyncMetrics } from "stroid/async";

const metrics = getAsyncMetrics("todos");
// { fetchCount: 4, lastFetchAt: 1714000000000, avgDuration: 123 }
```

---

## SSR / Next.js

Global stores are not safe to share across requests on the server. Stroid warns when `createStore` is called in a server environment (blocked in production Node unless opted in).

**Option A — Request-scoped stores (recommended)**

```js
import { createStoreForRequest } from "stroid/core";

// app/api/route.ts (Next.js App Router)
export async function GET(req) {
  const store = createStoreForRequest("req", { user: null });
  setStore("req", { user: await getUser(req) });
  return Response.json(getStore("req"));
}
```

**Option B — Server snapshot + client hydration**

Serialize stores on the server and hydrate them on the client. Hydration shallow-merges objects and replaces primitives.

```js
// Server
import { getStore } from "stroid/core";
const snapshot = { user: getStore("user"), settings: getStore("settings") };

// Client (e.g. in _app.tsx or a layout)
import { hydrateStores } from "stroid/core";
hydrateStores(snapshot);
```

**Option C — Suppress the warning (use with care)**

```js
createStore("global_config", { flags: {} }, { allowSSRGlobalStore: true });
```

---

## Testing

```js
import { createMockStore, resetAllStoresForTest, withMockedTime } from "stroid/testing";

beforeEach(() => {
  resetAllStoresForTest(); // Clears all stores between tests
});

test("increments counter", () => {
  createMockStore("counter", { count: 0 });
  setStore("counter", (d) => { d.count++; });
  expect(getStore("counter").count).toBe(1);
});

test("TTL expiry", () => {
  withMockedTime(() => {
    // Advance virtual timers here to test TTL, retries, etc.
  });
});
```

| Utility | Description |
|---|---|
| `createMockStore` | Like `createStore` but skips persistence, sync, and DevTools |
| `resetAllStoresForTest` | Tears down every store — use in `beforeEach` |
| `withMockedTime` | Runs a callback with mocked timers for testing TTLs and retries |

---

## Validation & Middleware

### Schema Validation

Pass any Zod, Yup, Valibot schema, or a plain predicate function as `schema`. Validation runs on every write. Failures call `onError` and **block the write**.

```js
import { z } from "zod";

createStore("user", { name: "Alex", age: 22 }, {
  schema: z.object({
    name: z.string(),
    age: z.number().min(0),
  }),
  middleware: [{
    onError: (err, context) => console.error("Validation failed:", err, context),
  }]
});

// This write will be blocked — age must be a number
setStore("user", { age: "not-a-number" });
```

### Middleware Hooks

Middleware is an array of objects with any combination of lifecycle hooks:

```js
createStore("user", initialState, {
  middleware: [
    {
      onSet: (next, current, name) => {
        console.log(`[${name}] writing`, next);
      },
      onReset: (name) => console.log(`[${name}] reset`),
      onDelete: (name) => console.log(`[${name}] deleted`),
      onCreate: (name, state) => console.log(`[${name}] created`, state),
      onError: (err, context) => console.error(err),
      redactor: (state) => ({ ...state, password: "***" }), // redact from DevTools
    }
  ]
});
```

| Hook | Signature | Description |
|---|---|---|
| `onSet` | `(next, current, name) => void` | Called before every write |
| `onReset` | `(name) => void` | Called on `resetStore` |
| `onDelete` | `(name) => void` | Called on `deleteStore` |
| `onCreate` | `(name, state) => void` | Called once when store is created |
| `onError` | `(err, context) => void` | Called when validation fails |
| `redactor` | `(state) => state` | Transforms state before sending to DevTools |

---

## TypeScript

Stroid ships full TypeScript types. For the best type safety, use `StoreDefinition`:

```ts
import { createStore, getStore, setStore } from "stroid/core";
import type { StoreDefinition, Path, PathValue } from "stroid/core";

// Define a typed store
type UserState = { name: string; profile: { theme: "light" | "dark" } };
type UserStore = StoreDefinition<"user", UserState>;

createStore("user", { name: "Alex", profile: { theme: "dark" } });

// Typed path access
const theme = getStore("user", "profile.theme"); // type: "light" | "dark"
setStore("user", "profile.theme", "light");       // type-checked value

// Path utilities
type ThemePath = Path<UserState>;                        // "name" | "profile" | "profile.theme"
type ThemeValue = PathValue<UserState, "profile.theme">; // "light" | "dark"
```

> String-name overloads (passing a plain string like `"user"`) are **runtime-only** and have looser types. Use `StoreDefinition` for full inference.

---

## Limitations & Gotchas

These are important to know before using Stroid in production:

| Limitation | Detail |
|---|---|
| ESM-only | No CommonJS support. Requires Node 18+ or a modern bundler. |
| Subpaths share a chunk | `stroid/core`, `stroid/react`, etc. currently share an internal chunk. True isolation is planned for v1.1. |
| No path auto-create | `setStore` path writes and `chain()` require the path to already exist. Use `mergeStore` to add new keys first. |
| `useStore` without selector | Subscribes to the full store — re-renders on **every** change. Always prefer a field or selector. |
| Date / Map / Set serialization | These types are serialized as JSON-friendly forms: `Date` → ISO string, `Map` → object, `Set` → array. Re-wrap them after reading from a persisted store. |
| Persistence is synchronous | Large state objects can block the main thread. Keep persisted state lean. |
| History diffs are shallow | `historyLimit` captures shallow diffs only. Deep nested changes may appear collapsed in DevTools. |
| BroadcastChannel clock skew | Default LWW sync uses `Date.now()`. Clock differences between tabs can cause unexpected conflict resolution. Use `conflictResolver` for critical stores. |
| `fetchStore` cacheKey reuse | Reusing the same `cacheKey` with different URLs returns the cached result from the first call. |

---

## Common Problems & Solutions

### ❌ `Invalid hook call` in Node.js

Hooks (`useStore`, `useSelector`, etc.) only work inside React function components. For Node.js scripts, use the core API from `stroid/core`.

---

### ⚠️ SSR warning: `createStore(...) called in a server environment`

Use `createStoreForRequest` for per-request state, or pass `{ allowSSRGlobalStore: true }` if you intentionally want a global store on the server.

---

### 🐛 Stale nested state after update

Always use a draft updater (or spread) for nested objects:

```js
// ✅ Correct
setStore("user", (draft) => {
  draft.profile.city = "Pokhara";
});

// ✅ Also correct
setStore("user", (prev) => ({
  ...prev,
  profile: { ...prev.profile, city: "Pokhara" }
}));

// ❌ Wrong — overwrites the whole store
setStore("user", { profile: { city: "Pokhara" } });
```

---

### 🗃️ Date / Map / Set lost after persistence

These types are not JSON-serializable and are stored in transformed forms. Re-wrap them after reading from a persisted store:

```js
const state = getStore("events");

// Date was stored as ISO string — re-wrap
const date = new Date(state.createdAt);

// Set was stored as array — re-wrap
const tags = new Set(state.tags);

// Map was stored as object — re-wrap
const lookup = new Map(Object.entries(state.lookup));
```

---

Avoid subscribing to the whole store in components that only need one field:

```js
// ❌ Re-renders on any field change
const user = useStore("user");

// ✅ Only re-renders when `name` changes
const name = useStore("user", "name");
// or
const name = useSelector("user", (s) => s.name);
```

---

## Roadmap

| Phase | Status | Description |
|---|---|---|
| Phase 1 | ✅ Done | `sideEffects` flag, testing subpath, dev-only warnings, lazy CRC init |
| Phase 2 | ✅ Done | Hooks split, subpath exports, focus/online revalidate, `useStore` selector overload |
| Phase 3 | 🔜 Planned | Modularize persistence / history / devtools / sync into opt-in chunks (v1.1) |

---

## Versioning

Stroid follows [Semantic Versioning](https://semver.org/):

- **MAJOR** — breaking changes
- **MINOR** — new backwards-compatible features
- **PATCH** — bug fixes

See [CHANGELOG.md](./CHANGELOG.md) for the full history.

---

## License

MIT © Stroid Contributors
