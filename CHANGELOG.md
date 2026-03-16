# Changelog

All notable changes to this project will be documented in this file.


## Unreleased
### Breaking
- `stroid/core` now exports only `createStore`, `setStore`, `getStore`, `hasStore`, `resetStore`, and `deleteStore` (minimal primitives).

### Migration


### Added
- `allowTrusted` hydration flag (aliasing `allowHydration`; `allowUntrusted` deprecated).
- `allowTrustedHydration` config alias for trusted snapshot hydration.
- `sync.loopGuard` option to suppress immediate rebroadcasts after an incoming sync update.
- `acknowledgeLooseTypes` config flag to silence the loose-type dev warning.
- `pathCacheSize` config to tune per-store path validation cache limits.
- `HydrateSnapshotFor<Map>` helper type for stricter hydration typing.
### Changed
- `createStoreForRequest` now hydrates with `{ allowTrusted: true }`.
- `getStore` now respects `snapshot` mode (`deep`/`shallow`/`ref`) for both whole-store and path reads.
- `setStore` TypeScript overloads consolidated to reduce IntelliSense noise while preserving typed paths/values.
- Lazy store typings now require `lazy: true` when initial data is a function (and vice versa).
- Persist `maxSize` warnings now fire only when an unbounded payload is large during hydration.
- Sync loop guard is enabled by default (opt out with `sync: { loopGuard: false }`).
- `useStore` warns once in dev when store names are untyped (StoreStateMap not augmented).

### Fixed
- Helper store typings now align with the stricter `createStore` overloads.


### Docs
- Hydration examples now reference `allowTrusted` language.
- Sync options documentation now includes `loopGuard`.
- Added notes for `acknowledgeLooseTypes`, `HydrateSnapshotFor`, and `pathCacheSize` in README.

### Testing
- Added regression coverage for `getStore` snapshot modes and `sync.loopGuard`.
- Added type-level regression checks for lazy store misuse.
- Added tests for loose-type warnings, loopGuard defaults, and path cache sizing.


## 0.1.1 - 2026-03-15
### Breaking
- `stroid/core` now exports only `createStore`, `setStore`, `getStore`, and `deleteStore` (minimal primitives).

### Migration
- If you relied on `stroid/core` for batching, reset, hydration, or other core APIs, import them from `stroid` instead.


### Added
- Public feature installer entrypoints and a features option bag for custom feature registration.
- Optional structural sharing via `configureStroid({ mutatorProduce })` (supports a global Immer shim).
- `strictAsyncUsageErrors` to throw on async usage errors when enabled.

### Changed
- SSR request APIs are now fully typed; `snapshotStrategy` drives the default snapshot mode.
- Config is registry-scoped to avoid cross-request bleed in SSR.
- Transaction snapshot caching is scoped to the active batch to reduce repeated cloning.
- Internal layering tightened without runtime behavior changes; added a guard against restricted lifecycle imports.

### Fixed
- Chunked flush delivery no longer mixes snapshots within a single notification.
- Persist sequencing avoids stale writes when debounce timers overlap.
- Notification queues and batch depth are registry-scoped for SSR safety.
- DTS build now succeeds with a type-safe internal cast for SSR options merges.
- `useStore` missing-store warning moved to render time for immediate feedback.
- Sync warns when authentication is missing or sign is configured without verify.

### Docs
- Standardized file header JSDoc and polished README guidance.

### Testing
- Expanded regression coverage across SSR, features, persist, and sync; coverage thresholds now pass.

## 0.1.0 - 2026-03-14
### Added
- `configureStroid({ strictMissingFeatures: true })` option to hard-fail when a feature is requested without its side-effect registration import.
- `configureStroid({ allowUntrustedHydration: true })` to opt in to hydrateStores on untrusted snapshots.
- `configureStroid({ mutatorProduce })` to plug in a structural-sharing mutator engine (e.g. Immer).
- `getSubscriberCount`, `getAsyncInflightCount`, and `getPersistQueueDepth` observability helpers in `runtime-tools`.
- `configureStroid({ assertRuntime: true })` option to throw on warnings/errors for test-time assertions.
- `createComputed(...)` for reactive derived stores.
- `getComputedGraph()` and `getComputedDeps()` diagnostics in `runtime-tools`.
- `configureStroid({ strictMutatorReturns: true })` to forbid mutator return values.
- `useStore`/`useSelector` now warn once when a store is missing (including SSR renders).
- `StrictStoreMap` opt-in type mode for compile-time enforcement of known store names.

### Changed
- Runtime now always surfaces missing feature registrations via warnings (even in production), and can throw when `strictMissingFeatures` is enabled.
- Default `Path<T>` inference depth increased to 10; use `PathDepth<T, N>` for deeper paths.
- Removed `mergeStore` and `chain` from the public API; use `setStore(name, partial)` and mutator updates instead.
- `setStoreBatch` is now transactional: batched writes are staged and only committed if the batch completes successfully. `createStore`, `deleteStore`, and `hydrateStores` are disallowed inside a batch.
- `setStoreBatch` now warns and no-ops when called with a non-function instead of throwing synchronously.
- `resetStore` and `deleteStore` now accept `StoreKey`/`StoreDefinition` handles in addition to string names.
- `useStore` overloads now return non-nullable values when called with `StoreKey`/`StoreDefinition` handles.
- Persist internals split into `features/persist/*` (crypto/load/save/watch/types) to keep responsibilities isolated.
- `fetchStore` now warns in dev when it auto-creates a missing store (to surface typos early).
- `fetchStore` now refuses to overwrite non-async store shapes unless a `stateAdapter` is provided.
- `fetchStore` now hard-fails when the per-store inflight slot limit is exceeded (throws instead of returning `null`).
- Selector cache logic in React hooks is shared between `useStore` and `useSelector` to avoid duplicate implementations and ensure consistent selector identity checks.
- Feature hook context creation now avoids full object spread copies on every write/delete to reduce overhead.
- Path validation cache is capped per-store (no global cache thrash); per-store cache entries are cleared on store invalidation/reset.
- Feature runtimes now initialize on registration/bind, removing redundant per-write initialization checks.
- `useAsyncStoreSuspense` now triggers/awaits async fetches and reuses inflight promises for React Suspense integration.
- Mutator-based `setStore` now honors non-undefined return values to replace draft updates.
- Mutator-based `setStore` now warns in dev when a mutator returns a value, since return values replace the entire store.
- `hydrateStores` now requires explicit trust via the third argument or `configureStroid({ allowUntrustedHydration: true })` (breaking for implicit hydration).
- Persist now supports async crypto hooks (`encryptAsync`/`decryptAsync`) and `checksum: "sha256"` for stronger integrity checks.
- `sanitize` now rejects non-serializable host objects (WeakRef/EventTarget/streams) earlier instead of letting clone fallbacks fail later.

### Fixed
- `deleteStore` no longer emits an intermediate null notification before deletion, preventing double-render transitions.
- Async fetch 60s timeout now clears on completion to avoid late error handling after a successful request.
- Async rate limiter metadata now clears on store deletion to prevent leakage across request scopes.
- Subscriber storage uses `Set` consistently across `subscribeStore` and `subscribeWithSelector`, preventing type mismatches.
- `clearAllStores` now removes stores created during delete hooks.
- SSR registry isolation now uses AsyncLocalStorage-backed registries to prevent concurrent request scope leakage.
- Registry bindings no longer go stale after scope rebinds; registry exports proxy to the active scope (SSR safe).
- Store names now reject `__proto__`, `constructor`, and `prototype`, and `hydrateStores` skips invalid names to prevent registry pollution.
- Persist now validates encrypt/decrypt round-trips and disables persistence when crypto hooks are misconfigured.
- `setStore` returns typed `WriteResult` objects without casting.
- `subscribeWithSelector` now uses store snapshots so selectors never receive mutable live references.
- `deepClone` fallback now preserves Dates consistently (no JSON stringify fallback).
- `hashState` now handles circular structures and uses a stronger 53-bit hash for non-string inputs while preserving legacy checksums for strings.
- Chunked notification delivery now defers remaining subscribers if the store updates mid-flush, avoiding mixed snapshots in a single delivery.
- Chunked notification delivery now includes subscribers added mid-flush in the same notification cycle.
- `_hardResetAllStoresForTest` is no longer exported from the main package entry; it remains in `stroid/testing`.
- Async rate limiter now initializes per-slot windows and prunes stale metadata to avoid unbounded growth.
- Computed cleanup registrations are now scoped to the active registry, preventing cross-request leaks in SSR.
- Store delete hooks now iterate the registered feature set (including third-party features).
- Computed creation logs now use the configured `logSink` instead of raw `console.log`.
- Async fetch usage errors now route through the configured `logSink.critical` in production.
- `useAsyncStoreSuspense` no longer allocates a new default options object each render, stabilizing memoization.

### Docs
- `subscribeWithSelector` now documents `prev` semantics for batched writes.

### Testing
- `patch0/test` completed the `P0` stabilization pass for core state safety and production failure handling.
- Core testing now covers immutable reads/snapshots/history, guarded validator and lifecycle failures, delete/persist races, reset persistence, sanitize rejection for hostile payloads, SSR async fail-fast behavior, hydration replacement semantics, and stale sync messages after delete.
- `patch1/testing` extends the stabilization pass across selector correctness, dotted-key path handling, retry/caching guardrails, environment defaults, and sync payload consistency.
- Patch1 testing now covers re-entrant notify delivery, selector subscription false positives, dependency-aware selector memoization, escaped dotted keys and dotted entity IDs, bounded retry/cache behavior, production fallback env resolution, and canonical sync payloads under redaction.
- `remain` continues the draft-issue hardening pass across persist initialization ordering, pollution-safe sanitization, deep-clone fallback safety, request-scope contract enforcement, promise retry semantics, synchronous batch guarantees, and fallback entity ID uniqueness.
- Testing now also covers persisted init load precedence, forbidden prototype keys, forced `deepClone` fallback behavior, request-scope unknown-store failures, promise-input retry bypass, async batch rejection, and fixed-clock fallback entity inserts.
- `debugging/bug` closes the remaining pre-push runtime gaps across React inline selector stability, async stale-request ordering, middleware veto semantics, clone fallback safety, and deep-freeze resilience.
- Testing now also includes mounted React hook runtime coverage for `useStore()` inline selectors, alongside the branch’s new regressions for stale async ordering, middleware vetoes, exact selector fallback matching, and cycle-safe deep freeze.
- CI test scripts now run directory-based Node tests and type tests build dist before type-checking package declarations.
- React Suspense coverage added for `useAsyncStoreSuspense`, including stable memoization under rerender.
- SSR carrier test now asserts the global store remains unpolluted after concurrent requests.

### Changed
- `v0.0.5` is now the active development branch. `main` stays locked on the released `0.0.4` line until the next release is cut.
- Release artifacts remain release-managed on this branch: `dist/` may be absent here or still reflect the last released `0.0.4` build while current source/docs continue to move forward.

## 0.0.4 - 2026-03-06
### Added
- Persistence recovery hooks: `persist.onMigrationFail` and `persist.onStorageCleared`.
- Sync hardening options and behaviors: `sync.maxPayloadBytes` plus snapshot requests for reconnecting tabs.
### Changed
- Docs: converted the repo docs into the chapter-based handbook, then aligned README and API chapters with the real package surface so examples now use `setStore(name, path, value)`, `getStore(name, path)`, `useStore(name, path)`, `subscribeWithSelector(name, selector, equalityFn, listener)`, and `useFormStore(name, field)`.
- Packaging: rebuilt `dist` from the current `src`, and fixed the `stroid/react` build entry so the published subpath exports `useAsyncStore` and `useFormStore` consistently with the root package and docs.
### Fixed
- `hydrateStores` now rejects invalid schema payloads without leaving broken store shells behind.
- Middleware throws no longer poison later notifications.
- Critical persistence failures in production now surface through `onError`.
- Async lifecycle cleanup is hardened: inflight metadata clears on store deletion, lifecycle-owned requests abort on delete, and internal cleanup registrations are removed correctly.
- Persisted version/schema mismatches can recover through `onMigrationFail`, and cleared storage keys can be detected through `onStorageCleared`.
- Sync now reports unavailable `BroadcastChannel` transport, rejects oversized payloads safely, orders conflicts with monotonic clocks, and requests fresh snapshots on reconnect/focus/online.

## 0.0.3 - 2026-03-04
### Fixed
- Persistence now catches `localStorage.setItem` / driver `setItem` errors (e.g., `QuotaExceededError`) and routes them to `onError` instead of letting them bubble and crash. State updates still apply while persistence failures surface to the app.
- Async fetch metadata (inflight, cache, registry) now cleans up when a store is deleted, avoiding stale entries and refetch surprises.
- `enableRevalidateOnFocus` now removes its focus/online listeners when the store is deleted, preventing event-listener leaks.
- React `useSelector` now memoizes selected values with shallow equality, preventing endless re-renders when selectors return new array/object references for unchanged data.
- Store schemas are now enforced on write (`setStore`), blocking invalid shapes at runtime instead of silently accepting them.
- `createStore` no longer overwrites an existing store name; it warns and keeps the original state.
- `setStore` path updates now respect existing structure: array paths no longer auto-create missing indices and array shapes are preserved instead of converting to objects.
- Docs: README updated with the pre-v1 bundle-size promise so the published package README matches the repo.

## 0.0.2 - 2026-03-03
### Added
- SSR helpers: `createStoreForRequest` and `hydrateStores` for request-scoped stores and snapshot hydration.
- Store helpers: `createEntityStore`, `createListStore`, and `createCounterStore` for common patterns.
- Observability: `getHistory`/`clearHistory` (with `historyLimit`) and `getMetrics` for notify timing.
- Sync tuning: optional `channel` and `conflictResolver`; warnings when BroadcastChannel is unavailable.
- Branding & DX: new logo/favicons, Next.js docs site with theme switcher, compact prev/next pager, robots.txt + sitemap + OG/Twitter metadata for SEO.
### Changed
- Docs now reflect actual APIs (persist driver/serialize/encrypt; top-level version/migrations; DevTools boolean + historyLimit).
### Fixed
- Hydration safety around theme toggles to prevent client/server mismatch warnings.

## 0.0.1
- Initial release: tsup-minified ESM bundles with subpath outputs; shared chunk noted; CJS omitted.
- Packaging: `sideEffects: false`, subpath exports (`./react`, `./async`, `./testing`), React peer dependency `>=18`.
- DX: `useStore` selector overload with dev warning on broad subscriptions; hooks split into core/async/form modules; usage docs with quick start, gotchas, limitations.
- Async: focus/online revalidation helper; dev warning when no AbortSignal is provided.
- Safety: path/type guard warnings dev-only; persist key collision warning; circular-friendly `produceClone` error message; Map/Set/Date warnings.
- Utils: CRC table lazy init.
- Docs: testing subpath guidance, LWW clock-skew note, semver policy.
