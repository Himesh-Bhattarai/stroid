# Core Overview

Branch: `v0.0.5`  
Generated: `2026-03-08`

This overview focuses on the **core Stroid API**, the real options that exist in the current source, why they matter, and which roadmap features are already present versus still planned.

## Core Status

- Core branch status is healthy: build, typecheck, and current tests pass.
- The core implementation is centered in `src/store.ts` and re-exported from `src/core.ts`.
- This file treats **current source code** as the source of truth, then compares it against `docs/24-roadmap.md`.

## Core APIs That Exist Now

| API Title | Main Inputs / Options | Description | Why It Is Important |
| --- | --- | --- | --- |
| `createStore` | `name`, `initialData`, `options` | Creates a store and registers its rules, lifecycle hooks, persistence, sync, validation, and metadata. | This is the entry point for all state. If this API is clear, the rest of the library stays understandable. |
| `setStore` | object patch, `path + value`, or mutator function | Updates store state using merge-style updates, path updates, or draft-style mutation. | This is the main write API. It defines how safe and ergonomic updates feel. |
| `setStoreBatch` | synchronous callback | Batches multiple updates so subscribers flush after the batch instead of after every write. | Important for performance and predictable notification timing. |
| `getStore` | `name`, optional path | Reads a deep-cloned snapshot of a full store or a nested path. | Critical for non-React reads and for avoiding accidental external mutation. |
| `mergeStore` | `name`, partial object | Shallow-merges fields into an existing object store. | Makes multi-field object updates explicit and readable. |
| `resetStore` | `name` | Restores a store to its initial snapshot. | Important for logout flows, form cancel flows, and test cleanup. |
| `deleteStore` | `name` | Fully removes a store, subscribers, history, persistence timers, and sync state. | Prevents stale state and resource leaks. |
| `clearAllStores` | none | Deletes every registered store. | Useful for tests, teardown, and app-wide cleanup. |
| `hasStore` | `name` | Checks whether a store exists. | Important for guard logic and controlled hydration flows. |
| `listStores` | none | Returns all registered store names. | Useful for debugging, tooling, and inspection. |
| `getStoreMeta` | `name` | Returns cloned metadata including timestamps, update count, metrics, version, and normalized options. | Important for diagnostics, devtools, and admin/debug views. |
| `subscribeWithSelector` | `name`, `selector`, optional equality, listener | Subscribes to derived values instead of full-store changes. | Reduces unnecessary reactions and improves scalability in large stores. |
| `createStoreForRequest` | optional initializer | Builds per-request buffered state without touching the global store registry. | Important for SSR and request isolation, especially in production server environments. |
| `hydrateStores` | snapshot, optional per-store options | Creates or replaces stores from a snapshot. | Important for SSR hydration, preload flows, and state replay. |
| `getHistory` | `name`, optional limit | Returns retained action history for a store. | Gives observability into change flow and debugging. |
| `clearHistory` | optional `name` | Clears history for one store or all stores. | Keeps debugging state manageable and avoids unbounded history growth. |
| `getMetrics` | `name` | Returns subscriber notification metrics. | Important for performance inspection and tuning. |
| `chain` | `name` | Fluent core helper for nested store reads and writes. | Improves ergonomics for teams that prefer chained access patterns. |

## `createStore` Options

These are the important core options because most advanced behavior is configured here.

| Option Title | Description | Why It Is Important |
| --- | --- | --- |
| `persist` | Enables storage persistence. Supports `true`, storage name strings, or a full config object. | Persistence is one of the main reasons to choose a state library beyond plain in-memory state. |
| `devtools` | Connects the store to Redux DevTools when available. | Important for debugging state transitions during development. |
| `middleware` | Array of functions that can inspect or transform pending updates. | Lets teams enforce conventions and cross-cutting behavior without rewriting store logic. |
| `onSet` | Called after successful updates. | Useful for side effects, analytics, and audit hooks. |
| `onReset` | Called after reset. | Useful for cleanup and reset-aware flows. |
| `onDelete` | Called before store teardown completes. | Important when deleting a store should trigger resource cleanup. |
| `onCreate` | Called after the store is created. | Useful for initialization hooks and instrumentation. |
| `onError` | Receives warnings and recoverable store errors. | Gives users a controlled way to surface failures without crashing the app. |
| `validator` | Boolean gate for next state. | Important for simple state rules without requiring a full schema system. |
| `schema` | Schema-style validation for committed state. | Critical for correctness when stores hold important or structured data. |
| `migrations` | Versioned transform map for persisted state. | Necessary when saved data must survive schema changes between releases. |
| `version` | Current version number for migration logic. | Gives persistence a stable way to evolve safely. |
| `redactor` | Redacts state before history or devtools exposure. | Important for security and privacy, especially with tokens or sensitive fields. |
| `historyLimit` | Limits retained change history length. | Prevents debugging features from turning into memory growth. |
| `allowSSRGlobalStore` | Opt-in to global server store creation in production. | Important because server-global state can leak data across requests if used carelessly. |
| `sync` | Enables BroadcastChannel-based cross-tab synchronization. | Important for multi-tab consistency in modern web apps. |

## `persist` Config Options

When `persist` is a config object, the current code supports these fields:

| Option Title | Description | Why It Is Important |
| --- | --- | --- |
| `driver` | Storage backend implementation. | Allows browser storage or custom persistence layers. |
| `key` | Storage key name. | Important for stable storage lookup and collision control. |
| `serialize` | Converts state to string before save. | Allows custom storage formats. |
| `deserialize` | Converts stored string back to state. | Required for loading persisted data safely. |
| `encrypt` | Transforms serialized data before save. | Important when stored data should not remain plain text. |
| `decrypt` | Reverses `encrypt` on load. | Required if encryption is used. |
| `onMigrationFail` | Recovery strategy when persisted state cannot be migrated. | Prevents broken saved data from permanently breaking the app. |
| `onStorageCleared` | Callback when persisted storage disappears or is cleared. | Important for resilience when users or browsers remove stored data mid-session. |

## `sync` Config Options

When `sync` is an object, the current code supports:

| Option Title | Description | Why It Is Important |
| --- | --- | --- |
| `channel` | Custom BroadcastChannel name. | Lets teams control sync boundaries between apps or environments. |
| `maxPayloadBytes` | Maximum sync payload size. | Prevents oversized broadcasts from hurting reliability. |
| `conflictResolver` | Hook to decide how local and incoming state should resolve. | Important for deterministic behavior when tabs update the same store concurrently. |

## Core Helper APIs In Main Package

These are not re-exported from `src/core.ts`, but they are part of the broader core story in the main package:

| API Title | Description | Why It Is Important |
| --- | --- | --- |
| `createSelector` | Creates a memoized selector with dependency tracking. | Improves derived state performance outside React. |
| `createCounterStore` | Builds a numeric counter store with helper methods. | Good for common demo and utility cases. |
| `createListStore` | Builds a list store with `push`, `removeAt`, `clear`, `replace`, and `all`. | Makes list state simpler to manage consistently. |
| `createEntityStore` | Builds normalized entity storage with `upsert`, `remove`, `all`, `get`, and `clear`. | Important for collection-heavy apps and normalized access patterns. |
| `getInitialState` | Returns the initial snapshot registry. | Useful for debugging and reset-aware workflows. |
| `createZustandCompatStore` | Small compatibility wrapper for Zustand-style initialization. | Helps migration and adoption from adjacent state ecosystems. |

## What Is Important In Core Right Now

The current core is strongest in these areas:

- safe store creation and teardown
- path-safe updates
- schema and validator enforcement
- persistence with migration recovery
- cross-tab sync guardrails
- metadata, history, and metrics for observability
- SSR protection through `createStoreForRequest` and `allowSSRGlobalStore`

## Core Roadmap: Exists Now vs Planned

This section compares the roadmap to the current branch.

| Roadmap Feature | Status In Current Branch | Why It Matters |
| --- | --- | --- |
| Remove Immer traces | Mostly present | The current code uses internal clone/mutator helpers rather than Immer itself, which keeps the core leaner and more controllable. |
| `isGlobal` | Missing | A first-class global/local store flag would make SSR behavior clearer and easier to inspect. |
| `isTemp` | Missing | Temporary-store semantics would help short-lived state and cleanup workflows. |
| `setStore.replace` | Missing | A dedicated replace API would remove ambiguity between shallow merge and full replacement. |
| `stroid/core` subpath | Exists | Important for users who want only the core surface and better tree-shaking boundaries. |
| `stroid/react` subpath | Exists | Confirms the package is already partially modular. |
| `stroid/async` subpath | Exists | Confirms async helpers are already separated. |
| `stroid/testing` subpath | Exists | Testing helpers are already split out and usable. |
| `stroid/persist` subpath | Missing | Would make persistence import boundaries cleaner. |
| `stroid/sync` subpath | Missing | Would help users who want cross-tab features without the full package surface. |
| `stroid/devtools` subpath | Missing | Would improve modularity and optional debugging imports. |
| Better warnings | Partially present | The core already has strong warning and error messaging, but this can still be standardized further. |
| Devtools stable | Partially present | Devtools integration exists, but roadmap language suggests more hardening is still intended. |
| Full TypeScript coverage | Partially present | Source types are strong, but exported declaration files and docs are not fully synchronized yet. |

## Must-Exist Roadmap Items To Track In This Overview

Because the roadmap promises these items before `1.0.0`, they should stay visible in the overview until delivered:

| Planned Feature | Target Roadmap Stage | Reason To Track |
| --- | --- | --- |
| `isGlobal` | `v0.0.5` | It affects SSR safety and store lifecycle clarity. |
| `isTemp` | `v0.0.5` | It affects temporary-store ergonomics and cleanup rules. |
| `setStore.replace` | `v0.0.5` | It clarifies replacement semantics in the core write API. |
| `stroid/persist` | `v0.0.6` | It improves package modularity. |
| `stroid/sync` | `v0.0.6` | It improves package modularity for sync-only consumers. |
| `stroid/devtools` | `v0.0.6` | It improves package modularity for debug tooling consumers. |
| declaration/docs alignment | `v0.0.7` and later | It prevents users from seeing an API shape that does not match the real source. |

## Practical Core Conclusion

The core of this branch is already meaningful and usable:

- store lifecycle is solid
- validation, persistence, sync, and SSR protections are real
- modular subpaths are partially delivered

The biggest core gaps against the roadmap are:

- missing `isGlobal`
- missing `isTemp`
- missing `setStore.replace`
- missing dedicated `persist`, `sync`, and `devtools` subpaths
- incomplete alignment between source, docs, and exported type declarations
