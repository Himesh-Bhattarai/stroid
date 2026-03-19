# Stroid

[![npm](https://img.shields.io/npm/v/stroid)](https://npmjs.com/package/stroid)
[![bundle size](https://img.shields.io/bundlephobia/minzip/stroid)](https://bundlephobia.com/package/stroid)
[![types](https://img.shields.io/npm/types/stroid)](https://npmjs.com/package/stroid)
[![license](https://img.shields.io/npm/l/stroid)](./LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/Himesh-Bhattarai/stroid/ci.yml)](https://github.com/Himesh-Bhattarai/stroid/actions)

**Named-store state engine for TypeScript and React.**

Every store has a name. Write to it from anywhere — hooks, utilities, server, tests. Optional layers add persistence, sync, async fetch, SSR isolation, and devtools without coupling to your core logic.

```ts
createStore("user", { name: "Ava", role: "admin" })  // define once
setStore("user", "name", "Kai")                       // write from anywhere
const name = useStore("user", s => s.name)            // React hook (stroid/react)
```

---

## Install

```bash
npm install stroid
```

**Requirements:** Node `>=18`. React `>=18` (only if using `stroid/react`).

---

## Layer Map

```
┌─────────────────────────────────────────────────────────┐
│                        your app                         │
├─────────────────────────────────────────────────────────┤
│  useStore  useSelector  useAsyncStore  useFormStore      │  stroid/react
├─────────────────────────────────────────────────────────┤
│  createStore  setStore  getStore  setStoreBatch          │  stroid  ← core
│  createComputed  createSelector  createEntityStore       │
├──────────────┬──────────────┬───────────────────────────┤
│ stroid/persist│ stroid/sync  │ stroid/async              │  opt-in features
│ localStorage  │ BroadcastCh  │ fetch + cache + retry     │
├──────────────┴──────────────┴───────────────────────────┤
│  stroid/server   createStoreForRequest (AsyncLocalStorage)│  SSR
├─────────────────────────────────────────────────────────┤
│  stroid/devtools   stroid/testing   stroid/runtime-tools │  tooling
└─────────────────────────────────────────────────────────┘
```

Each row is independent. Use only what you need.

`stroid/core` exports only `createStore`, `setStore`, `getStore`, `hasStore`, `resetStore`, and `deleteStore`. Import from `stroid` for the full runtime (batching, hydration, computed). React hooks live in `stroid/react`.

---

## Quick API Reference

| API | Purpose |
|-----|---------|
| `createStore(name, state, options?)` | Define a store. Returns `StoreDefinition \| undefined`. |
| `createStoreStrict(name, state, options?)` | Define a store; throw synchronously on failure. |
| `setStore(name, update)` | Shallow-merge an object update into the store. |
| `setStore(name, path, value)` | Write a value by dot-path or array path. |
| `setStore(name, draft => { })` | Mutate with a function (optional Immer support). |
| `replaceStore(name, value)` | Replace the entire store value. |
| `getStore(name, path?)` | Read a store (or a nested path). |
| `deleteStore(name)` | Remove a store from the registry. |
| `resetStore(name)` | Restore a store to its initial state. |
| `hasStore(name)` | Check if a store exists. |
| `setStoreBatch(fn)` | Atomic multi-store write — rolls back all writes on failure. |
| `hydrateStores(snapshot, options?, trust)` | Rehydrate on client from a server snapshot. |
| `useStore(name, selector?)` | React hook — subscribes to a store. |
| `useSelector(name, fn)` | React hook — fine-grained derived value. |
| `fetchStore(name, url, options?)` | Async fetch wired to store state. |
| `createComputed(name, deps, fn)` | Reactive derived store. |
| `createStoreForRequest(fn)` | Per-request SSR registry. |

---

## Module Import Map

```ts
// Core
import { createStore, setStore, getStore, hasStore,
         deleteStore, resetStore, setStoreBatch, hydrateStores } from "stroid"

// Minimal core (bundle-size-sensitive)
import { createStore, setStore, getStore, hasStore,
         resetStore, deleteStore } from "stroid/core"

// React
import { useStore, useSelector, useStoreField, useStoreStatic,
         useAsyncStore, useFormStore, useAsyncStoreSuspense,
         RegistryScope } from "stroid/react"

// Async
import { fetchStore, refetchStore, enableRevalidateOnFocus } from "stroid/async"

// Selectors & Computed
import { createSelector, subscribeWithSelector } from "stroid/selectors"
import { createComputed, invalidateComputed,
         deleteComputed, isComputedStore }       from "stroid/computed"

// Features (side-effect imports — register once at app entry)
import "stroid/persist"
import "stroid/sync"
import "stroid/devtools"

// Server / SSR
import { createStoreForRequest } from "stroid/server"

// Helpers & Testing
import { createEntityStore, createListStore, createCounterStore } from "stroid/helpers"
import { createMockStore, resetAllStoresForTest,
         withMockedTime, benchmarkStoreSet }     from "stroid/testing"

// Runtime Observability
import { listStores, getStoreMeta, getMetrics,
         getSubscriberCount, getStoreHealth, findColdStores,
         getComputedGraph, getComputedDeps,
         getPersistQueueDepth }                  from "stroid/runtime-tools"
import { clearAllStores, clearStores }           from "stroid/runtime-admin"

// Devtools API (after `import "stroid/devtools"`)
import { getHistory, clearHistory } from "stroid/devtools"

// Config
import { configureStroid, resetConfig,
         registerMutatorProduce }               from "stroid"

// Feature plugin API
import { registerStoreFeature,
         hasRegisteredStoreFeature,
         getRegisteredFeatureNames }            from "stroid/feature"
```

---

## Docs

Full documentation in [`/docs`](./docs/):

- [Architecture](./docs/architecture/ARCHITECTURE.md) — layers, data flow, registry model
- [Core Concepts](./docs/core-concepts/STORES.md) — store lifecycle, options, write modes
- [React Layer](./docs/guides/REACT.md) — hooks, selectors, SSR
- [Async Layer](./docs/guides/ASYNC.md) — `fetchStore`, caching, revalidation
- [Persistence](./docs/guides/PERSIST.md) — `localStorage`, encryption, migrations
- [Cross-tab Sync](./docs/guides/SYNC.md) — `BroadcastChannel`, conflict resolution
- [Computed Stores](./docs/guides/COMPUTED.md) — reactive derived values
- [Server & SSR](./docs/guides/SERVER.md) — request-scoped stores, hydration
- [Testing](./docs/guides/TESTING.md) — mock stores, resets, benchmarks
- [Devtools](./docs/guides/DEVTOOLS.md) — history, redaction
- [Runtime Tools](./docs/guides/RUNTIME_TOOLS.md) — observability, health checks
- [Full API Reference](./docs/api/API_REFERENCE.md)
- [Project Status](./STATUS.MD)
- [Contributing](./CONTRIBUTING.md)

---

## Changelog & License

- [CHANGELOG](./CHANGELOG.md)
- [MIT License](./LICENSE)
- [Issues](https://github.com/Himesh-Bhattarai/stroid/issues)
