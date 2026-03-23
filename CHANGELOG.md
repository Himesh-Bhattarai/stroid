# Changelog

All notable changes to this project are documented in this file.  
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning: [Semantic Versioning](https://semver.org/).

---
<details open>
<summary><strong>Unreleased</strong></summary>

- Added `stroid/psr` as a dedicated native PSR contract entrypoint with committed-only no-track snapshot reads, observation helpers, and explicit timing-contract reporting.
- Added a canonical `RuntimePatch` model under the PSR surface and lowered `setStore`, `replaceStore`, `resetStore`, and `hydrateStores` into serializable runtime patch records internally.
- Added public PSR patch-write APIs via `applyStorePatch()` and `applyStorePatchesAtomic()` for canonical `set` and root-level `merge` patches.
- Hardened transaction commit semantics so failed batched commits roll back staged store state, reset metrics, and queued notifications, while commit-phase feature hook errors no longer break atomic batches.
- Added computed classification descriptors plus snapshot evaluation APIs for Phase 5 PSR-native integration, defaulting unclassified computeds to `opaque` so only explicitly deterministic nodes are simulated.
- Hardened Phase 6 graph identity with stable runtime node IDs, store-granularity runtime graphs, typed dependency edges, and PSR graph reads that accept both stable node IDs and legacy computed store names.
- Hardened Phase 7 timing semantics with explicit governance modes, mutation authority, causality-boundary reporting, and concrete contract reasons for async persistence, sync authority sharing, and async-boundary computed propagation.
- Added a Phase 8 faithfulness suite that locks preview-vs-commit equivalence for deterministic public PSR flows, verifies public atomic rollback visibility rules, exercises async-boundary stop conditions, and smoke-tests production usage from only public entrypoints.
- Hardened production SSR computed registration so computed stores inherit explicit global SSR opt-in from already-global dependencies and fail cleanly without leaving stray computed registrations when global creation is unsupported.
- Added a 250K unique-subscriber benchmark, a 250K concurrent subscriber benchmark with real-world multi-store fanout scenarios, and lean performance-suite coverage for concurrent subscriber and sync broadcast timing; refreshed benchmark harnesses to use explicit feature installers and truly unique subscriber callbacks.
- Breaking: changed `stroid/persist`, `stroid/sync`, and `stroid/devtools` to side-effect-free modules that export explicit installers (`installPersist`, `installSync`, `installDevtools`) instead of auto-registering on import.
- Updated package exports, docs, and feature-install guidance to make optional feature registration explicit and more tree-shakeable.
- Stopped publishing `.map` source maps in the npm tarball to reduce package weight while keeping local build/debug output unchanged.
- Removed dead `./vue` and `./svelte` package exports that did not have built output behind them.

</details>

---

<details>
<summary><strong>0.1.3 --> 2026-03-22</strong></summary>

- Fixed async rate limiting so `fetchStore(..., { cacheKey })` is throttled per `cacheSlot` instead of incorrectly sharing one counter across the whole store name.
- Fixed `createSelector` dependency tracking for object-valued reads so cached selector results no longer go stale when object references change without primitive leaf access.
- Fixed `setStoreBatch` teardown so a later commit-phase feature error does not discard notifications that were already queued by earlier successful commits.
- Fixed persist unload listeners so deleting and recreating a persisted store no longer accumulates stale `pagehide` / `beforeunload` flush handlers.
- Fixed sync-applied remote state so feature write hooks still run, allowing `persist` and other write-driven features to observe synced updates.
- Fixed `clearAllStores()` under `assertRuntime: true` so a successful clear logs normally instead of throwing from the success path.
- Fixed sync checksum handling so incoming sync payloads are now verified before remote state is accepted.
- Fixed async request defaults so bodyless `GET` / `HEAD` / `DELETE` requests no longer send `Content-Type: application/json`.
- Fixed `createComputed(..., { autoDispose: true })` so computed stores are removed after their last dependency is deleted.
- Fixed `resetStore()` for falsy initial values (`false`, `0`, `""`, `null`) so registered stores no longer report `not-found` during reset.
- Replaced the default registry scope's `import.meta.url`-based identifier with a stable bundler-safe string to avoid webpack / Next.js resolution failures.
- Hardened SSR write-context isolation by routing `runWithWriteContext(...)` through the server AsyncLocalStorage runner instead of relying only on a module-level fallback context.
- Hardened inline notification delivery to snapshot the subscriber list per flush instead of reusing a shared registry buffer.
- Tightened React hook type coverage for ambient `StoreStateMap` usage, including `useStore`, `useStoreField`, `useStoreStatic`, `useSelector`, `useFormStore`, `useAsyncStore`, and `useAsyncStoreSuspense`.
- Clarified React selector recreation warnings and docs so they describe selector churn and cache reuse accurately instead of implying repeated re-subscriptions.
- Upgraded the transitive `flatted` resolution to `3.4.2` via `npm overrides` to address the Dependabot alert in the eslint / flat-cache toolchain path.

</details>

---


<details>
<summary><strong>0.1.2 --> 2026-03-19</strong></summary>
> **Note:** This release contains breaking changes to the `stroid/core` export surface and hydration defaults to improve bundle size and security.

- `hydrateStores` now requires an explicit trust argument at the TypeScript level (compile-time enforcement).
- Default snapshot mode changed to `"shallow"` (was `"deep"`). Override per-store with `snapshot: "deep"` or globally with `configureStroid({ defaultSnapshotMode: "deep" })`.

### Migration

- If you use `stroid/core` for batching, reset, or hydration — move those imports to `stroid`.
- If you call `hydrateStores` without a trust argument — add `{ allowTrusted: true }` as the third argument.
- If your app relies on deep-clone snapshot semantics — add `snapshot: "deep"` to affected stores or set `configureStroid({ defaultSnapshotMode: "deep" })`.

### Performance

- Hot-path proxy avoidance: `deliverFlush` now captures direct registry references once and reuses them during the flush loop.
- `Array.from` elimination: replaced per-flush subscriber array allocations with a registry-level reusable buffer.
- `buildFlushPlan` collapse: reduced passes, preserved `pendingBuffer` semantics, and removed the terminal `orderedNames.slice()` allocation.

### Added

- `allowTrusted` hydration flag (aliasing `allowHydration`; `allowUntrusted` deprecated).
- `allowTrustedHydration` config alias.
- `sync.loopGuard` option to suppress immediate rebroadcasts after an incoming sync update.
- `registerMutatorProduce` helper for safely registering Immer (or other mutator engines).
- `selectorCloneFrozen` config flag to control frozen-state cloning in `createSelector` (dev performance toggle).
- `createStoreForRequest` now exposes the request `registry` for `RegistryScope` or advanced SSR usage.
- `stroid/server` now re-exports the `StoreRegistry` type for SSR typing.
- Store metrics now include reset timing (`resetCount`, `totalResetMs`, `lastResetMs`).
- API Extractor configuration and `docs:api` script for generating typed API reports.
- `IStoreCore` shared interface and `store-core` adapter for layer boundaries.
- ESLint layer guards for async-cache and store-notify imports.
- Optional TypeScript layer configs (`tsconfig.layers.json`) for build-time dependency checks.
- `sync.insecure` option to explicitly allow unauthenticated sync in production.
- `onValidationError` hook for hydrate trust validation failures.
- `acknowledgeLooseTypes` config flag to silence the loose-type dev warning.
- `pathCacheSize` config to tune per-store path validation cache limits.
- `HydrateSnapshotFor<Map>` helper type for stricter hydration typing.
- Internal lifecycle hook hub for decoupled cross-layer events.
- Lazy store lifecycle helpers: `isLazyStore`, `isLazyPending`, `isStoreMaterialized`.
- `autoCorrelationIds` config and `fetchStore` correlation/trace context propagation.
- `getStoreHealth()` unified observability helper for per-store and global metrics.
- `findColdStores()` to surface cold/stale/write-only stores.
- Root exports for `getMetrics` and `getAsyncMetrics` for discoverability.
- Reserved `stroid/vue` and `stroid/svelte` entry points (adapter placeholders, not implemented).
- `onStoreLifecycle` registry hook for single-listener lifecycle events (devtools-oriented).

### Changed

- `createStoreForRequest` now hydrates with `{ allowTrusted: true }`.
- `getStore` now respects `snapshot` mode (`deep`/`shallow`/`ref`) for both whole-store and path reads.
- `setStore` TypeScript overloads consolidated to reduce IntelliSense noise.
- Lazy store typings now require `lazy: true` when initial data is a function.
- Sync loop guard is enabled by default (opt out with `sync: { loopGuard: false }`).
- Unauthenticated sync is blocked in production unless `authToken`, `verify`, or `insecure` is provided.
- `hydrateStores` throws in dev when `trust.validate` throws; routes via `onError` in production.
- `hydrateStores` returns structured `failed` entries with `blocked` reasons.
- `mutatorProduce: "immer"` now uses `registerMutatorProduce`.
- `useStore` warns once in dev when store names are untyped.
- `useStore` broad-subscription warnings now surface outside dev (once per store).
- `snapshot: "shallow"` now dev-freezes the top-level snapshot.
- Notification pipeline split into `notification/*` modules.
- Async cache cleanup hooks now register through lifecycle hooks.
- `resetStore` reports `lazy-uninitialized` when called before materialization.
- `setStoreBatch` throws in production SSR on the global registry (requires request scope).
- Store metadata now tracks read counts and last-read timestamps.
- Middleware contexts include optional `correlationId`/`traceContext`.
- React hooks live exclusively under `stroid/react`.
- `deepClone` throws on non-cloneable values.
- `endTransaction` now executes all pending commit callbacks, capturing the first error while allowing remaining commits to run.

### Fixed

- Helper store typings align with stricter `createStore` overloads.
- `replaceStore` now participates in `setStoreBatch` transactions.
- Removed dead `runInline` logic from the chunked notify queue.
- Selector reads in request scope no longer leak through the default registry.
- React hooks now resolve the active request registry when `RegistryScope` is omitted during SSR hydration.
- Chunked flush now snapshots subscribers per task to avoid mid-flush corruption.
- `injectTransactionRunner` ignores unsafe reinjection attempts.
- `endTransaction` surfaces commit-phase errors.
- Persist writes re-check the latest sequence before `setItem`.
- `fetchStore` sets an error state when `transform` returns a Promise.
- Async rate limiting is enforced per store (not per cache slot).
- `hydrateStores` recomputes affected computed stores after hydration.
- User `onError` callbacks are now isolated from core operations if they throw.

### Docs

- Hydration examples now reference `allowTrusted` language.
- Sync options documentation now includes `loopGuard`.
- README now documents `registerMutatorProduce`, `sync.insecure`, and `onValidationError`.
- React SSR docs now mention `stores.registry` and the automatic request-registry fallback.

</details>

---

<details>
<summary><strong>0.1.1 --> 2026-03-15</strong></summary>

### Breaking

- `stroid/core` now exports only `createStore`, `setStore`, `getStore`, and `deleteStore` (minimal primitives).

### Migration

- If you used `stroid/core` for batching, reset, or hydration — import those from `stroid` instead.

### Added

- Public feature installer entrypoints and a `features` option bag for custom feature registration.
- Optional structural sharing via `configureStroid({ mutatorProduce })` (supports a global Immer shim).
- `strictAsyncUsageErrors` to throw on async usage errors when enabled.

### Changed

- SSR request APIs are now fully typed; `snapshotStrategy` drives the default snapshot mode.
- Config is registry-scoped to avoid cross-request bleed in SSR.
- Transaction snapshot caching scoped to the active batch.
- Internal layering tightened; added guard against restricted lifecycle imports.

### Fixed

- Chunked flush delivery no longer mixes snapshots within a single notification.
- Persist sequencing avoids stale writes when debounce timers overlap.
- Notification queues and batch depth are registry-scoped for SSR safety.
- DTS build succeeds with a type-safe internal cast for SSR options merges.
- `useStore` missing-store warning moved to render time for immediate feedback.
- Sync warns when authentication is missing or `sign` is configured without `verify`.

</details>

---

<details>
<summary><strong>0.1.0 --> 2026-03-14</strong></summary>

### Added

- `configureStroid({ strictMissingFeatures: true })` to hard-fail when a feature is used without its side-effect import.
- `configureStroid({ allowUntrustedHydration: true })` to opt in to `hydrateStores` on untrusted snapshots.
- `configureStroid({ mutatorProduce })` to plug in a structural-sharing mutator engine.
- `getSubscriberCount`, `getAsyncInflightCount`, `getPersistQueueDepth` observability helpers.
- `configureStroid({ assertRuntime: true })` to throw on warnings/errors.
- `createComputed(...)` for reactive derived stores.
- `getComputedGraph()` and `getComputedDeps()` diagnostics.
- `configureStroid({ strictMutatorReturns: true })` to forbid mutator return values.
- `StrictStoreMap` opt-in type mode.

### Breaking Changes

- Removed `mergeStore` and `chain` from the public API.
- `setStoreBatch` is now transactional (staged writes, atomic commit, rollback on error).
- `createStore`, `deleteStore`, `hydrateStores` are disallowed inside a batch.
- `hydrateStores` requires explicit trust via third argument or config.

### Fixed

- `deleteStore` no longer emits an intermediate null notification.
- Async fetch 60s timeout now clears on completion.
- `clearAllStores` now removes stores created during delete hooks.
- SSR registry isolation uses `AsyncLocalStorage`-backed registries.
- Store names reject `__proto__`, `constructor`, `prototype`.

</details>

---

<details>
<summary><strong>0.0.4 --> 2026-03-06</strong></summary>

### Added

- Persistence recovery hooks: `persist.onMigrationFail` and `persist.onStorageCleared`.
- Sync hardening: `sync.maxPayloadBytes` and snapshot requests for reconnecting tabs.

### Changed

- Docs: converted repo docs into chapter-based handbook; aligned README and API chapters with real package surface.
- Packaging: rebuilt `dist` from current `src`; fixed `stroid/react` build entry.

### Fixed

- `hydrateStores` rejects invalid schema payloads without leaving broken store shells.
- Middleware throws no longer poison later notifications.
- Async lifecycle cleanup hardened (inflight metadata clears on store deletion).

</details>

---

<details>
<summary><strong>0.0.3 --> 2026-03-04</strong></summary>

### Fixed

- Persistence catches `localStorage.setItem` errors (e.g., `QuotaExceededError`) and routes to `onError`.
- Async fetch metadata cleans up when a store is deleted.
- `enableRevalidateOnFocus` removes focus/online listeners when the store is deleted.
- `useSelector` memoizes with shallow equality, preventing endless re-renders.
- Store schemas now enforced on write (`setStore`).
- `createStore` no longer overwrites an existing store name.
- `setStore` path updates preserve array shapes instead of converting to objects.

</details>

---

<details>
<summary><strong>0.0.2 --> 2026-03-03</strong></summary>

### Added

- SSR helpers: `createStoreForRequest` and `hydrateStores`.
- Store helpers: `createEntityStore`, `createListStore`, `createCounterStore`.
- Observability: `getHistory`, `clearHistory`, `getMetrics`.
- Sync tuning: optional `channel` and `conflictResolver`.

### Fixed

- Hydration safety around theme toggles.

</details>

---

<details>
<summary><strong>0.0.1 --> Initial Release</strong></summary>

- tsup-minified ESM bundles with subpath outputs.
- `useStore` selector overload with dev warning on broad subscriptions.
- Hooks split into core/async/form modules.
- Async focus/online revalidation helper.
- Safety: path/type guard warnings, persist key collision warning.
- CRC table lazy init.

</details>
