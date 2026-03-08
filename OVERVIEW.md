# Stroid Overview

## Purpose

This file is the current source-map for Stroid.

It answers:
- what each `src` file is for
- what belongs to core
- what belongs to optional features
- what users should import
- what Stroid must keep to avoid losing its identity
- what can be traded off for size

---

## 1. Core Runtime

### `src/store.ts`
- Main store engine.
- Owns:
  - store registry
  - subscribers
  - metadata
  - notifications
  - batching
  - history access bridge
- Main APIs:
  - `createStore`
  - `setStore`
  - `setStoreBatch`
  - `getStore`
  - `deleteStore`
  - `resetStore`
  - `mergeStore`
  - `clearAllStores`
  - `hasStore`
  - `listStores`
  - `getStoreMeta`
  - `hydrateStores`
  - `getInitialState`
  - `getMetrics`

### `src/utils.ts`
- Shared runtime utility layer.
- Contains:
  - env/dev flags
  - warn/error/log
  - hashing
  - deep clone
  - produceClone
  - schema validation runner
  - sanitize
  - path parsing
  - path read/write
  - store name validation and suggestions

### `src/adapters/options.ts`
- User option normalization layer.
- Converts grouped user options into runtime-ready normalized options.
- Contains types for:
  - `StoreOptions`
  - `PersistOptions`
  - `SyncOptions`
  - `DevtoolsOptions`
  - `LifecycleOptions`
  - `NormalizedOptions`

### `src/features/lifecycle.ts`
- Lifecycle and middleware runner.
- Contains:
  - middleware execution
  - lifecycle hook calling
  - abort symbol

### `src/devfreeze.ts`
- Dev-only deep freeze helper for safer snapshots in development.

### `src/core.ts`
- Lean public core entrypoint.
- Re-exports the smaller core package surface.

### `src/index.ts`
- Lean default public entrypoint.
- Now intentionally close to `core`.
- Does not auto-enable optional runtime features.

---

## 2. Feature Registration Layer

### `src/feature-registry.ts`
- Internal registration system for optional runtime features.
- Current feature names:
  - `persist`
  - `sync`
  - `devtools`
- Purpose:
  - keep `createStore(..., options)` shape stable
  - activate feature behavior only when the feature module is imported

This is the key architectural bridge between:
- lean package entrypoints
- same public option object

---

## 3. Optional Runtime Features

### Persistence

#### `src/features/persist.ts`
- Persistence runtime implementation.
- Owns:
  - load/save
  - storage watch
  - migration handling
  - checksum handling
  - cleanup timers

#### `src/persist.ts`
- Side-effect feature registration entrypoint.
- Importing this activates `persist` support.

### Sync

#### `src/features/sync.ts`
- Sync runtime implementation.
- Owns:
  - BroadcastChannel setup
  - clock/version handling
  - conflict resolution
  - message broadcasting
  - reconnect catch-up
  - cleanup

#### `src/sync.ts`
- Side-effect feature registration entrypoint.
- Importing this activates `sync` support.

### Devtools

#### `src/features/devtools.ts`
- Devtools/history runtime implementation.
- Owns:
  - history snapshots
  - shallow diffs
  - Redux DevTools bridge
  - history cleanup

#### `src/devtools.ts`
- Side-effect feature registration entrypoint.
- Importing this activates `devtools` support.
- Public path:
  - `stroid/devtools`
- Exports:
  - `getHistory`
  - `clearHistory`
  - `HistoryEntry`
  - `HistoryDiff`

#### `src/devtools-api.ts`
- Devtools-only public API bridge.
- Reads history APIs from the registered devtools runtime.
- Keeps history access out of lean core exports.

---

## 4. React Layer

### `src/hooks-core.ts`
- Main React hook integration.
- Contains:
  - `useStore`
  - `useStoreField`
  - `useSelector`
  - `useStoreStatic`

### `src/hooks-async.ts`
- Async-specific React adapter.
- Contains:
  - `useAsyncStore`

### `src/hooks-form.ts`
- Form-oriented hook helper.
- Contains:
  - `useFormStore`

### `src/hooks.ts`
- Public React entrypoint.
- Re-exports all React hooks.

---

## 5. Async Layer

### `src/async.ts`
- Async data-store integration.
- Contains:
  - `fetchStore`
  - `refetchStore`
  - `enableRevalidateOnFocus`
  - `getAsyncMetrics`
- Owns:
  - request dedupe
  - retry handling
  - stale-while-revalidate behavior
  - async cleanup
  - metrics

---

## 6. Other Public Subpaths

### `src/chain.ts`
- Fluent nested read/write helper.
- Public path:
  - `stroid/chain`

### `src/selectors.ts`
- Selector-specific subscription helpers.
- Public path:
  - `stroid/selectors`
- Exports:
  - `createSelector`
  - `subscribeWithSelector`

### `src/helpers.ts`
- Helper factory entrypoint.
- Public path:
  - `stroid/helpers`
- Re-exports:
  - `createCounterStore`
  - `createListStore`
  - `createEntityStore`

### `src/server.ts`
- Request-scoped helper entrypoint.
- Public path:
  - `stroid/server`
- Re-exports:
  - `createStoreForRequest`

### `src/testing.ts`
- Test helper entrypoint.
- Public path:
  - `stroid/testing`
- Exports:
  - `createMockStore`
  - `withMockedTime`
  - `resetAllStoresForTest`
  - `benchmarkStoreSet`

---

## 7. Source Layout by Topic

### Core
- `src/store.ts`
- `src/utils.ts`
- `src/adapters/options.ts`
- `src/features/lifecycle.ts`
- `src/devfreeze.ts`
- `src/core.ts`
- `src/index.ts`

### Feature registry
- `src/feature-registry.ts`

### Runtime features
- `src/features/persist.ts`
- `src/features/sync.ts`
- `src/features/devtools.ts`
- `src/devtools-api.ts`
- `src/persist.ts`
- `src/sync.ts`
- `src/devtools.ts`

### React
- `src/hooks-core.ts`
- `src/hooks-async.ts`
- `src/hooks-form.ts`
- `src/hooks.ts`

### Async
- `src/async.ts`

### Utility/public extras
- `src/chain.ts`
- `src/selectors.ts`
- `src/selectors-entry.ts`
- `src/helpers.ts`
- `src/server.ts`
- `src/testing.ts`

---

## 8. What Users Must Import

### Lean default

```ts
import { createStore, setStore, getStore } from "stroid";
```

Use this for:
- core store behavior
- grouped options
- validation/schema
- lifecycle
- metrics access

### Optional runtime features

```ts
import "stroid/persist";
import "stroid/sync";
import "stroid/devtools";
```

Use these when the store options include:
- `persist`
- `sync`
- `devtools`

Without these imports, the options are not active and Stroid should warn.

### Devtools history APIs

```ts
import { getHistory, clearHistory } from "stroid/devtools";
```

### React

```ts
import { useStore, useSelector, useAsyncStore, useFormStore } from "stroid/react";
```

### Async

```ts
import { fetchStore, refetchStore, enableRevalidateOnFocus } from "stroid/async";
```

### Chain

```ts
import { chain } from "stroid/chain";
```

### Selectors

```ts
import { createSelector, subscribeWithSelector } from "stroid/selectors";
```

### Helpers

```ts
import { createCounterStore, createListStore, createEntityStore } from "stroid/helpers";
```

### Server

```ts
import { createStoreForRequest } from "stroid/server";
```

### Testing

```ts
import { createMockStore, resetAllStoresForTest } from "stroid/testing";
```

---

## 9. What Must Stay in Stroid Identity

These are the parts Stroid should keep if it wants to remain Stroid and not become a generic mini-store.

### Must keep
- Named store model
- `createStore(name, initial, options)` API shape
- Central option object
- Built-in validation/schema path
- Built-in lifecycle/middleware path
- First-party feature modules for:
  - persist
  - sync
  - devtools
- Registry-aware runtime behavior

### Why these matter
- This is the real difference between Stroid and simpler store primitives.
- This is what makes Stroid feel like a designed state system instead of a bag of helpers.

---

## 10. What Can Be Traded Off

These can move out of the default package without destroying Stroid identity.

### Safe to keep out of lean default
- React hooks
- async helpers
- `chain`
- selector helpers
- helper factories
- server/request-scoped helper
- testing helpers

### Why these are safe to move
- They are useful, but not the core identity.
- They are consumer-specific layers, not universal store semantics.

---

## 11. What Must Not Be Traded Off Too Far

If these are removed or hollowed out too much, Stroid loses its point.

### Dangerous cuts
- turning Stroid into only `createStore / setStore / getStore`
- removing the central option-object design
- removing first-party feature modules
- removing named-store semantics
- reducing Stroid to middleware composition only

### Why
- At that point Stroid stops being its own product.
- It becomes just another tiny store primitive with extra files.

---

## 12. Size vs Identity Decision

### Good tradeoff
- keep `stroid` lean
- keep feature modules explicit
- keep one option-object design
- keep first-party runtime features

### Bad tradeoff
- keep shrinking until the package no longer expresses Stroid's opinionated runtime model

### Current best direction
- `stroid` = lean default package
- `stroid/persist`, `stroid/sync`, `stroid/devtools` = explicit runtime features
- `stroid/react`, `stroid/async`, `stroid/chain`, `stroid/helpers`, `stroid/server`, `stroid/testing` = explicit layer imports

That keeps:
- the size story honest
- the architecture coherent
- the Stroid identity intact

---

## 13. Recommended Import Rules

### Must import explicitly
- `stroid/persist` when using `persist`
- `stroid/sync` when using `sync`
- `stroid/devtools` when using `devtools`
- `stroid/devtools` for `getHistory` and `clearHistory`
- `stroid/react` for React hooks
- `stroid/async` for async helpers
- `stroid/chain` for chain API
- `stroid/selectors` for `createSelector` and `subscribeWithSelector`
- `stroid/helpers` for helper factories
- `stroid/server` for request-scoped helper
- `stroid/testing` for testing helpers

### Do not put back into lean `stroid`
- React hooks
- async helpers
- automatic feature registration
- `chain`
- selector helpers
- helper factories
- server helper
- testing helpers

### Keep in lean `stroid`
- store core APIs
- validation/schema
- lifecycle
- grouped options
- metrics access

---

## 14. Final Verdict

Stroid should be:
- a lean named-store runtime by default
- with explicit first-party feature modules
- with one coherent `createStore(..., options)` mental model

Stroid should not become:
- a kitchen-sink default bundle again
- or a featureless tiny primitive with no clear identity

That is the balance point.
