# Architecture

> **Confidence: HIGH** — derived directly from source code structure and module annotations.

## Overview

Stroid is a named-store state engine. Its defining characteristic is that every store has a string name. This name is the address of the store — used for reading, writing, subscribing, persisting, syncing, computing, and debugging.

The system is layered: a small mandatory core, and a set of optional feature modules that register themselves explicitly. No optional feature adds overhead to stores that do not use it.

---

## Layer Stack

```
┌────────────────────────────────────────────────────────────┐
│ src/index.ts        Public API barrel (stroid)             │
│ src/store.ts        Core runtime re-exports                │
├────────────────────────────────────────────────────────────┤
│ src/core/store-write.ts    createStore, setStore, etc.     │
│ src/core/store-read.ts     getStore, hasStore, getMetrics  │
│ src/core/store-notify.ts   subscribeStore, setStoreBatch   │
│ src/core/store-name.ts     store(), namespace()            │
│ src/core/store-transaction.ts  batch/rollback state        │
├────────────────────────────────────────────────────────────┤
│ src/core/store-lifecycle/                                  │
│   registry.ts      StoreRegistry, meta, subscribers        │
│   validation.ts    sanitize, path cache, normalizeCommit   │
│   hooks.ts         feature hook invocation                 │
│   identity.ts      nameOf, reportError, SSR warnings       │
│   types.ts         StoreDefinition, WriteResult, paths     │
│   bind.ts          feature API binding                     │
├────────────────────────────────────────────────────────────┤
│ src/notification/                                          │
│   scheduler.ts     chunked delivery, priority ordering     │
│   delivery.ts      subscriber dispatch                     │
│   snapshot.ts      snapshot mode handling                  │
│   priority.ts      priority store ordering                 │
│   metrics.ts       notify timing                           │
├────────────────────────────────────────────────────────────┤
│ src/computed/                                              │
│   index.ts         createComputed, deleteComputed          │
│   computed-graph.ts dependency graph, cycle detection      │
├────────────────────────────────────────────────────────────┤
│ src/features/                                              │
│   feature-registry.ts  registerStoreFeature, hook dispatch │
│   persist.ts       persistence feature hooks               │
│   persist/         crypto, load, save, watch, types        │
│   sync.ts          BroadcastChannel sync feature hooks     │
│   devtools.ts      history, redaction feature hooks        │
│   lifecycle.ts     MIDDLEWARE_ABORT, middleware runner      │
│   state-helpers.ts createEntityStore, createCounterStore   │
├────────────────────────────────────────────────────────────┤
│ src/async/                                                 │
│   fetch.ts         fetchStore, refetchStore                │
│   cache.ts         TTL cache, inflight registry            │
│   retry.ts         retry delay logic                       │
│   rate.ts          per-store rate limiter                  │
│   inflight.ts      dedup / version tracking                │
│   request.ts       buildFetchOptions, parseResponseBody    │
│   errors.ts        async usage error routing               │
│   registry.ts      async registry shape                    │
├────────────────────────────────────────────────────────────┤
│ src/selectors/index.ts  createSelector, subscribeWithSelector │
│ src/react/         useStore, useSelector, useFormStore, etc │
│ src/server/        createStoreForRequest (AsyncLocalStorage) │
│ src/helpers/       createEntityStore, createListStore, etc  │
│ src/devtools/      getHistory, clearHistory, installDevtools │
│ src/runtime-tools/ listStores, getMetrics, getStoreHealth  │
│ src/runtime-admin/ clearAllStores, clearStores             │
├────────────────────────────────────────────────────────────┤
│ src/internals/                                             │
│   config.ts        configureStroid, global config state    │
│   diagnostics.ts   warn/error routing                      │
│   store-ops.ts     internal store read/write               │
│   store-admin.ts   delete hooks                            │
│   write-context.ts correlationId / traceContext propagation│
│   test-reset.ts    deterministic test teardown             │
│   computed-order.ts topological sort                       │
│   selector-store.ts selector-facing store access           │
│   hooks-warnings.ts one-time warning deduplication         │
│   reporting.ts     structured error reporting              │
└────────────────────────────────────────────────────────────┘
```

---

## Registry Model

A single `StoreRegistry` object holds all runtime state for a given scope:

```ts
{
  stores: Record<string, unknown>         // live store values
  initialStates: Record<string, unknown>  // deep clones at create time
  initialFactories: Record<string, () => unknown>  // lazy factories
  subscribers: Record<string, Set<Subscriber>>     // notification sets
  metaEntries: Record<string, StoreMeta>  // metrics, options, timestamps
  notify: FlushState                      // scheduler state
  computedCleanups: Map<string, () => void>
  scope: "global" | "request" | "temp"
}
```

In SSR, each request gets its own `StoreRegistry` backed by `AsyncLocalStorage`. The default registry is the global registry used in browser and Node environments that are not inside a `createStoreForRequest` context.

---

## Write Data Flow

```
setStore(name, update)
  │
  ├─ resolve active registry
  ├─ materializeInitial (lazy store hydration)
  ├─ validate store exists
  ├─ compute next value (merge / path / mutator)
  ├─ sanitizeValue (reject non-serializable types)
  ├─ runMiddlewareForStore (can return MIDDLEWARE_ABORT)
  ├─ normalizeCommittedState (validate rule)
  ├─ shallowEqual check (skip notification if unchanged)
  │
  ├─ [if inside setStoreBatch]
  │     └─ stageTransactionValue → registerTransactionCommit
  │
  └─ [otherwise] commitStoreUpdate
        ├─ setStoreValueInternal
        ├─ update meta (updatedAt, updateCount, correlationId)
        ├─ runFeatureWriteHooks (persist save, sync broadcast, devtools record)
        ├─ runStoreHookSafe (onSet lifecycle hook)
        └─ notifyStore → scheduler → subscribers
```

---

## Notification Pipeline

Subscribers are notified asynchronously after a write commits. The notification pipeline in `src/notification/` handles:

- **Priority ordering** — stores named in `configureStroid({ flush: { priorityStores } })` notify their subscribers first.
- **Chunked delivery** — controlled via `flush.chunkSize` and `flush.chunkDelayMs`.
- **Snapshot modes** — each subscriber receives a clone of the store value controlled by `snapshot: "deep" | "shallow" | "ref"` (default: `"deep"`).
- **Mid-flush updates** — if a store updates while its subscribers are being notified, the updated snapshot is delivered in the same cycle.

---

## Feature Hook Model

Optional features (persist, sync, devtools) register themselves through `registerStoreFeature()`. The core lifecycle layer invokes three types of hooks:

| Hook Type | Trigger | Who Uses It |
|-----------|---------|-------------|
| `onStoreCreate` | After `createStore` succeeds | persist (load), sync (subscribe), devtools (init history) |
| `onStoreWrite` | After each committed write | persist (save), sync (broadcast), devtools (record history) |
| `beforeStoreDelete` | Before `deleteStore` removes the store | persist (cleanup), sync (unsub), async (cancel inflight) |

Features are opt-in. If `persist: true` is set on a store but `installPersist()` was never called, Stroid warns (or throws with `strictMissingFeatures: true`).

---

## SSR Isolation

`createStoreForRequest` in `stroid/server` creates a new `StoreRegistry` and runs a callback inside it using `AsyncLocalStorage`. All store operations inside that callback (including nested async calls) resolve to the request-scoped registry. Concurrent requests never share store values or subscribers.

`createStoreForRequest` returns a `stores` object with `.hydrate(fn)` and `.snapshot()` methods for rendering and serializing state to send to the client.

---

## Computed Stores

Computed stores are regular stores whose values are derived from dependencies. When any dependency changes, `createComputed` re-runs the compute function and calls `replaceStore` on the computed store. The dependency graph is tracked in `computed-graph.ts` and checked for cycles at registration time. Flush order is topologically sorted to ensure dependents always receive up-to-date values.

---

## Transaction Model

`setStoreBatch(fn)` stages all writes (via `stageTransactionValue`) instead of committing them immediately. When the batch function returns without error, all staged writes commit atomically. If the batch throws or any write fails, all staged writes are discarded (rollback).

`createStore`, `deleteStore`, and `hydrateStores` are disallowed inside a batch — they throw/warn if attempted.

---

## Config System

`configureStroid(config)` is registry-scoped. In SSR environments, each request registry gets a cloned config derived from the global base config. This prevents cross-request config bleed when one request temporarily adjusts logging or middleware.
