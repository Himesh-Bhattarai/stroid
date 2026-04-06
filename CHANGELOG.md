# Changelog
>[!IMPORTANT]
>All notable changes to this project are documented in this file.  
>Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
>Versioning: [Semantic Versioning](https://semver.org/).
>Version_Migration : [docs/STROID_VERSION_MIGRATION/INDEX.md](docs/STROID_VERSION_MIGRATION/INDEX.md)

---

>[!NOTE]
><details open>
><summary><strong> Unreleased </strong></summary>
>
>### Add
>
>- Added an optional fourth `hydrateStores(..., options, trust, consistency?)` argument for post-hydration consistency contracts, including snapshot metadata, per-store authorities, per-store reconciliation policies, and `onDrift` diagnostics.
>- Added large-payload hydration parity coverage plus a dedicated `benchmark:hydration-large-payload` script to measure clone cost, queued replay cost, and retained heap across multi-hundred-KB to multi-MB state sizes.
>- Added hydration boot-window write deferral with deterministic replay for early `effect`, `storage`, `network`, and `sync` writes, plus policy execution for `server_wins`, `client_wins`, `merge`, and `invalidate_and_refetch`.
>- Added manual hydration boot-window control through `HydrationResult.bootWindow`, including `bootWindow: { mode: "manual" }`, optional `fallbackMs`, and runtime metrics that expose whether manual close is available.
>- Added `stroid/runtime-tools` hydration observability helpers: `getHydrationConsistency()`, `getHydrationDriftEvents()`, and `getHydrationDriftMetrics()`.
>- Added `stroid/server/portable` for explicit request-scope hand-off across serverless and framework boundaries, including `createRequestScope(...)`, capture/resume coverage, and a local provider-model certification for AWS Lambda, Vercel render-to-action hand-off, and Cloudflare Workers-style isolates.
>- Added React 18 concurrency certification for `useStore(...)`, including no-tearing regression coverage under `useTransition` and `useDeferredValue`, plus a dedicated `benchmark:react-concurrency` script that validates the existing `useSyncExternalStore` hook path.
>- Added a concrete Next.js App Router render-to-server-action hand-off example, regression coverage, and `benchmark:next-server-actions`, so request-scoped state capture and resume is now documented and locally certified instead of only described as a manual boundary.
>- Added a dedicated `stroid/query` entrypoint for `reactQueryKey` and `swrKey`, so cache-key helpers can be imported without pulling the heavier async query fetcher surface.
>
>### Change
>
>- Reduced cold and write-path overhead by lazily short-circuiting feature lifecycle dispatch when no registered runtime hooks apply to a store, avoiding unnecessary per-store context allocation on `createStore(...)` and `setStore(...)`.
>- Added an internal large-snapshot hydration gate: when consistency mode is enabled and no explicit boot window is provided, payloads above ~256KB now use a short timer boot-window path so early writes can route through the existing hydration queue.
>- Added request-scope carrier memoization during SSR hydration runs to reduce repeated AsyncLocalStorage lookups for carrier access inside the same request boundary.
>- Hardened `createStoreForRequest().hydrate(...)` to scrub finished carrier state after snapshot sync, then added detached-continuation regression coverage and a warm-container SSR certification benchmark for sequential request reuse.
>- Hardened hydration reconciliation so throwing custom `merge(...)` or normalization callbacks now fall back safely to the hydrated baseline, then added randomized replay certification coverage and a dedicated `benchmark:hydration-randomized` script.
>- Hardened hydration replay ordering by draining deferred writes through their monotonic enqueue sequence, then added long-lived websocket/sync stream regression coverage plus `benchmark:websocket-stream` to certify pre-close queueing and post-close continuation order.
>- Hardened integration, regression, and public type coverage for post-hydration drift governance, including early effect input, stale storage restore ordering, websocket/sync burst replay, and invalidation-driven async refetch recovery.
>- Upgraded `benchmark:hydration-divergence` into a first-class hydration guarantee suite with `try`, `hit`, `stress`, and `hammer` campaigns under the manual-close boundary, and folded that certification into `benchmark:guarantees`.
>- Reduced `stroid/persist` import retention by routing the leaf entrypoint to the direct feature installer, and regrouped `runtime-tools` internals plus query-key helpers for narrower future tree-shaking work.
>- Removed the dead `computed-types` JavaScript build entry and added `module` plus explicit `./query` export metadata for bundler compatibility.
>- Removed incorrect `sideEffects` metadata that pointed at unpublished source paths; the package now stays conservative until the remaining import-time effects are isolated explicitly.
>- Added computed topo-order memoization with graph-version invalidation so unchanged computed graphs no longer re-run dependency ordering on every flush.
>- Added async slot indexing and incremental prune cadence, reducing repeated full-map scans in `pruneAsyncCache`, `clearAsyncMeta`, and inflight slot counting paths.
>- Added `getAsyncMetrics(name?)` per-store reporting while preserving the existing global aggregate metrics shape.
>- Added configurable `resetStore` clone strategy (`deep` / `shallow` / `none`) via per-store `resetClone` and global `configureStroid({ resetCloneMode })`.
>- Reorganized stress benchmark runner scripts under `scripts/core/` and updated benchmark npm commands accordingly.
>- Reorganized benchmark scripts by domain under `scripts/core`, `scripts/ssr`, `scripts/hydration`, `scripts/react`, `scripts/guarantees`, and `scripts/comparison`, then updated benchmark command wiring.
>- Added manual `workflow_dispatch` support to the Scorecard workflow so code-scanning and supply-chain checks can be re-run on demand after hardening changes.
>
>### Fix
>
>- Fixed root API report surface by exporting previously leaked public dependency types (computed/store/hydration/config/runtime option helpers), removing `ae-forgotten-export` warnings from `docs/api/stroid.api.md`.
>- Fixed root TypeScript config scope so `tsc -p tsconfig.json --noEmit` now validates the source runtime surface directly instead of traversing docs/test/example-only graphs that require separate tooling configs.
>- Fixed store-destroy teardown so deleted stores now clear pending notify queue references and drop cached feature-hook contexts immediately, preventing long-run subscriber/context retention across create/delete churn.
>- Fixed `resetStore()` so it now returns `reason: "no-initial-state"` when a store exists but its reset snapshot is missing, instead of collapsing that branch into `not-found`.
>- Fixed workflow hardening gaps flagged by code scanning: added explicit top-level token permissions where missing and pinned GitHub Actions to immutable commit SHAs.
>- Fixed STATUS commit validation for Dependabot updates by accepting the bot-generated optional `(deps)` / `(deps-dev)` scope suffix while preserving STATUS-code enforcement.
>- Fixed `getAsyncMetrics(...)` public typings so `getAsyncMetrics()` remains non-null while `getAsyncMetrics(name)` is correctly typed as nullable per-store lookup.
>- Fixed SSR isolation benchmark request stability by retrying transient loopback `fetch` failures in the React streaming HTTP certification phase.
>- Fixed integration/regression harness imports to follow the new benchmark shared-helper locations after script folder reorganization.
>
>### Docs
>
>- Added a dedicated Post-Hydration Consistency guide with adoption defaults and updated the README, server guide, runtime-tools guide, benchmark report, version migration guide, and `NEXT_PHASE.md` status note to reflect the shipped consistency layer.
>- Added bundle-sensitive import guidance and bundle-closure benchmark notes to the README and docs, including the new `stroid/query` path, the measurable `stroid/persist` win, and the current root-entry limitations.
>- Documented runtime caveats for validated store names, direct-Promise async fetches, BroadcastChannel startup/BFCache limits, and Safari/WebKit storage eviction in the README and guides.
>- Added `STATUS.md` so the commit and issue-close workflow referenced by `CONTRIBUTING.md` is now present in the repository.
>- Documented async metrics per-store reads and reset clone-mode controls in README and guide docs.
></details>


---
>[!WARNING]
><details >
><summary><strong>0.1.4 --> 2026-3-30 </strong></summary>
>
>### Breaking
>
>- None.
>
>### Add
>
>- None.
>
>### Fix
>
>- Fixed async persist hydration so Promise-returning `persist.driver.getItem()` now loads stored state even when crypto hooks and checksums stay synchronous.
>- Fixed persist hydration payload guards so falsy serialized values (`""`, `"0"`, `"false"`) now hydrate correctly instead of being treated as missing data.
>- Fixed async persist clear detection so `onStorageCleared` now resolves Promise-based drivers instead of treating every pending read as "present".
>- Fixed focus revalidation cleanup so queued staggered and batched refetch timers are cancelled when the returned cleanup runs.
>- Fixed async inflight dedupe contracts so raw callers no longer inherit another caller's transformed result for the same cache slot.
>- Fixed computed identity checks so stable object outputs no longer trigger redundant `replaceStore()` writes during dependency recompute or `hydrateStores()` recompute.
>- Fixed request-scoped selectors so `createSelector(...)` now reads carrier-backed state during `createStoreForRequest().hydrate(...)`.
>- Fixed `resetStore()` in request scope so `onReset(prev)` receives the live pre-reset value instead of the registry placeholder.
>- Fixed `deleteStore()` in request scope so `onDelete(prev)` receives the live pre-delete value.
>- Fixed request-scope delete cleanup so removing a store also clears its carrier-backed value instead of leaving hidden stale request state behind.
>- Fixed request-scope `hydrateStores()` runtime patches so canonical root `set` patches always include the committed hydrated value.
>- Fixed public feature hook contexts so `onStoreCreate` and `onStoreWrite` expose committed request-scoped state through `ctx.getStoreValue()` and `ctx.getAllStores()`.
>- Fixed public delete feature hook contexts so `beforeStoreDelete` exposes committed request-scoped state through `ctx.prev`, `ctx.getStoreValue()`, and `ctx.getAllStores()`.
>
></details>
>
---
>[!CAUTION]
><details>
><summary><strong>0.1.4-beta.0 --> 2026-03-23</strong></summary>
>
>### Breaking
>
>- Breaking: changed `stroid/persist`, `stroid/sync`, and `stroid/devtools` to side-effect-free modules that export explicit installers (`installPersist`, `installSync`, `installDevtools`) instead of auto-registering on import.
>
>### Add
>
>- Added `stroid/psr` as a dedicated native PSR contract entrypoint with committed-only no-track snapshot reads, observation helpers, and explicit timing-contract reporting.
>- Added a canonical `RuntimePatch` model under the PSR surface and lowered `setStore`, `replaceStore`, `resetStore`, and `hydrateStores` into serializable runtime patch records internally.
>- Added public PSR patch-write APIs via `applyStorePatch()` and `applyStorePatchesAtomic()` for canonical `set` and root-level `merge` patches.
>- Added computed classification descriptors plus snapshot evaluation APIs for Phase 5 PSR-native integration, defaulting unclassified computeds to `opaque` so only explicitly deterministic nodes are simulated.
>- Added a Phase 8 faithfulness suite that locks preview-vs-commit equivalence for deterministic public PSR flows, verifies public atomic rollback visibility rules, exercises async-boundary stop conditions, and smoke-tests production usage from only public entrypoints.
>- Added a 250K unique-subscriber benchmark, a 250K concurrent subscriber benchmark with real-world multi-store fanout scenarios, and lean performance-suite coverage for concurrent subscriber and sync broadcast timing; refreshed benchmark harnesses to use explicit feature installers and truly unique subscriber callbacks.
>
>### Change
>
>- Expanded the public PSR patch surface to support nested `merge`, `delete`, and `insert`, with canonical path-array behavior and `failedPatchId` reporting for both single and atomic failures.
>- Hardened public PSR package-level contract coverage to verify built `dist` entrypoints can detect, read, subscribe to, and patch stores created through the main `stroid` entrypoint.
>- Tightened public PSR patch rejection semantics with stable `unsupported-op` and `unsupported-path-shape` reason codes for unsupported patch forms.
>- Hardened Phase 6 graph identity with stable runtime node IDs, store-granularity runtime graphs, typed dependency edges, and PSR graph reads that accept both stable node IDs and legacy computed store names.
>- Hardened Phase 7 timing semantics with explicit governance modes, mutation authority, causality-boundary reporting, and concrete contract reasons for async persistence, sync authority sharing, and async-boundary computed propagation.
>- Expanded built-package PSR contract tests to cover committed-final subscription timing, idempotent unsubscribe behavior, computed-settle notification ordering, and timing/governance downgrade claims.
>- Hardened production SSR computed registration so computed stores inherit explicit global SSR opt-in from already-global dependencies and fail cleanly without leaving stray computed registrations when global creation is unsupported.
>- Updated package exports, docs, and feature-install guidance to make optional feature registration explicit and more tree-shakeable.
>- Stopped publishing `.map` source maps in the npm tarball to reduce package weight while keeping local build/debug output unchanged.
>- Removed dead `./vue` and `./svelte` package exports that did not have built output behind them.
>
>### Fix
>
>- Fixed the published ESM package layout so `stroid`, `stroid/psr`, and sibling entrypoints share one runtime registry/computed graph instead of shipping isolated bundled state.
>- Hardened transaction commit semantics so failed batched commits roll back staged store state, reset metrics, and queued notifications, while commit-phase feature hook errors no longer break atomic batches.
>- Fixed `createStoreForRequest` so the documented callback API now exposes `api.snapshot()`.
>- Fixed `createStoreForRequest().set(name, object)` so later external mutation of the caller payload no longer mutates request state.
>- Fixed `createStoreForRequest()` so request-scope writes made during `hydrate()` now persist into later `snapshot()` output and repeated `hydrate()` calls.
>- Fixed `fetchStore()` timeouts without a caller-provided signal so the internally created request is now aborted when the timeout fires.
>- Fixed `fetchStore()` request versioning so a timed-out request can no longer reuse a cleared version and overwrite a newer in-flight response.
>
>### Docs
>
>- Added a dedicated public PSR guide and support matrix covering patch support, reason codes, runtime node ID treatment, subscription timing, and downgrade rules.
></details>
>
---
>[!WARNING]
><details>
><summary><strong>0.1.3 --> 2026-03-22</strong></summary>
>
>### Breaking
>
>- None.
>
>### Add
>
>- None.
>
>### Fix
>
>- Fixed async rate limiting so `fetchStore(..., { cacheKey })` is throttled per `cacheSlot` instead of incorrectly sharing one counter across the whole store name.
>- Fixed `createSelector` dependency tracking for object-valued reads so cached selector results no longer go stale when object references change without primitive leaf access.
>- Fixed `setStoreBatch` teardown so a later commit-phase feature error does not discard notifications that were already queued by earlier successful commits.
>- Fixed persist unload listeners so deleting and recreating a persisted store no longer accumulates stale `pagehide` / `beforeunload` flush handlers.
>- Fixed sync-applied remote state so feature write hooks still run, allowing `persist` and other write-driven features to observe synced updates.
>- Fixed `clearAllStores()` under `assertRuntime: true` so a successful clear logs normally instead of throwing from the success path.
>- Fixed sync checksum handling so incoming sync payloads are now verified before remote state is accepted.
>- Fixed async request defaults so bodyless `GET` / `HEAD` / `DELETE` requests no longer send `Content-Type: application/json`.
>- Fixed `createComputed(..., { autoDispose: true })` so computed stores are removed after their last dependency is deleted.
>- Fixed `resetStore()` for falsy initial values (`false`, `0`, `""`, `null`) so registered stores no longer report `not-found` during reset.
>- Replaced the default registry scope's `import.meta.url`-based identifier with a stable bundler-safe string to avoid webpack / Next.js resolution failures.
>- Hardened SSR write-context isolation by routing `runWithWriteContext(...)` through the server AsyncLocalStorage runner instead of relying only on a module-level fallback context.
>- Hardened inline notification delivery to snapshot the subscriber list per flush instead of reusing a shared registry buffer.
>- Tightened React hook type coverage for ambient `StoreStateMap` usage, including `useStore`, `useStoreField`, `useStoreStatic`, `useSelector`, `useFormStore`, `useAsyncStore`, and `useAsyncStoreSuspense`.
>- Clarified React selector recreation warnings and docs so they describe selector churn and cache reuse accurately instead of implying repeated re-subscriptions.
>- Upgraded the transitive `flatted` resolution to `3.4.2` via `npm overrides` to address the Dependabot alert in the eslint / flat-cache toolchain path.
></details>
>
---
>[!CAUTION]
><details>
><summary><strong>0.1.2 --> 2026-03-19</strong></summary>
>
>### Breaking
>
>- Breaking changes to the `stroid/core` export surface and hydration defaults to improve bundle size and security.
>- `hydrateStores` now requires an explicit trust argument at the TypeScript level (compile-time enforcement).
>- Default snapshot mode changed to `"shallow"` (was `"deep"`). Override per-store with `snapshot: "deep"` or globally with `configureStroid({ defaultSnapshotMode: "deep" })`.
>
>### Migration
>
>- If you use `stroid/core` for batching, reset, or hydration — move those imports to `stroid`.
>- If you call `hydrateStores` without a trust argument — add `{ allowTrusted: true }` as the third argument.
>- If your app relies on deep-clone snapshot semantics — add `snapshot: "deep"` to affected stores or set `configureStroid({ defaultSnapshotMode: "deep" })`.
>
>### Performance
>
>- Hot-path proxy avoidance: `deliverFlush` now captures direct registry references once and reuses them during the flush loop.
>- `Array.from` elimination: replaced per-flush subscriber array allocations with a registry-level reusable buffer.
>- `buildFlushPlan` collapse: reduced passes, preserved `pendingBuffer` semantics, and removed the terminal `orderedNames.slice()` allocation.
>
>### Add
>
>- `allowTrusted` hydration flag (aliasing `allowHydration`; `allowUntrusted` deprecated).
>- `allowTrustedHydration` config alias.
>- `sync.loopGuard` option to suppress immediate rebroadcasts after an incoming sync update.
>- `registerMutatorProduce` helper for safely registering Immer (or other mutator engines).
>- `selectorCloneFrozen` config flag to control frozen-state cloning in `createSelector` (dev performance toggle).
>- `createStoreForRequest` now exposes the request `registry` for `RegistryScope` or advanced SSR usage.
>- `stroid/server` now re-exports the `StoreRegistry` type for SSR typing.
>- Store metrics now include reset timing (`resetCount`, `totalResetMs`, `lastResetMs`).
>- API Extractor configuration and `docs:api` script for generating typed API reports.
>- `IStoreCore` shared interface and `store-core` adapter for layer boundaries.
>- ESLint layer guards for async-cache and store-notify imports.
>- Optional TypeScript layer configs (`tsconfig.layers.json`) for build-time dependency checks.
>- `sync.insecure` option to explicitly allow unauthenticated sync in production.
>- `onValidationError` hook for hydrate trust validation failures.
>- `acknowledgeLooseTypes` config flag to silence the loose-type dev warning.
>- `pathCacheSize` config to tune per-store path validation cache limits.
>- `HydrateSnapshotFor<Map>` helper type for stricter hydration typing.
>- Internal lifecycle hook hub for decoupled cross-layer events.
>- Lazy store lifecycle helpers: `isLazyStore`, `isLazyPending`, `isStoreMaterialized`.
>- `autoCorrelationIds` config and `fetchStore` correlation/trace context propagation.
>- `getStoreHealth()` unified observability helper for per-store and global metrics.
>- `findColdStores()` to surface cold/stale/write-only stores.
>- Root exports for `getMetrics` and `getAsyncMetrics` for discoverability.
>- Reserved `stroid/vue` and `stroid/svelte` entry points (adapter placeholders, not implemented).
>- `onStoreLifecycle` registry hook for single-listener lifecycle events (devtools-oriented).
>
>### Change
>
>- `createStoreForRequest` now hydrates with `{ allowTrusted: true }`.
>- `getStore` now respects `snapshot` mode (`deep`/`shallow`/`ref`) for both whole-store and path reads.
>- `setStore` TypeScript overloads consolidated to reduce IntelliSense noise.
>- Lazy store typings now require `lazy: true` when initial data is a function.
>- Sync loop guard is enabled by default (opt out with `sync: { loopGuard: false }`).
>- Unauthenticated sync is blocked in production unless `authToken`, `verify`, or `insecure` is provided.
>- `hydrateStores` throws in dev when `trust.validate` throws; routes via `onError` in production.
>- `hydrateStores` returns structured `failed` entries with `blocked` reasons.
>- `mutatorProduce: "immer"` now uses `registerMutatorProduce`.
>- `useStore` warns once in dev when store names are untyped.
>- `useStore` broad-subscription warnings now surface outside dev (once per store).
>- `snapshot: "shallow"` now dev-freezes the top-level snapshot.
>- Notification pipeline split into `notification/*` modules.
>- Async cache cleanup hooks now register through lifecycle hooks.
>- `resetStore` reports `lazy-uninitialized` when called before materialization.
>- `setStoreBatch` throws in production SSR on the global registry (requires request scope).
>- Store metadata now tracks read counts and last-read timestamps.
>- Middleware contexts include optional `correlationId`/`traceContext`.
>- React hooks live exclusively under `stroid/react`.
>- `deepClone` throws on non-cloneable values.
>- `endTransaction` now executes all pending commit callbacks, capturing the first error while allowing remaining commits to run.
>
>### Fix
>
>- Helper store typings align with stricter `createStore` overloads.
>- `replaceStore` now participates in `setStoreBatch` transactions.
>- Removed dead `runInline` logic from the chunked notify queue.
>- Selector reads in request scope no longer leak through the default registry.
>- React hooks now resolve the active request registry when `RegistryScope` is omitted during SSR hydration.
>- Chunked flush now snapshots subscribers per task to avoid mid-flush corruption.
>- `injectTransactionRunner` ignores unsafe reinjection attempts.
>- `endTransaction` surfaces commit-phase errors.
>- Persist writes re-check the latest sequence before `setItem`.
>- `fetchStore` sets an error state when `transform` returns a Promise.
>- Async rate limiting is enforced per store (not per cache slot).
>- `hydrateStores` recomputes affected computed stores after hydration.
>- User `onError` callbacks are now isolated from core operations if they throw.
>
>### Docs
>
>- Hydration examples now reference `allowTrusted` language.
>- Sync options documentation now includes `loopGuard`.
>- README now documents `registerMutatorProduce`, `sync.insecure`, and `onValidationError`.
>- React SSR docs now mention `stores.registry` and the automatic request-registry fallback.
></details>
>
---
>[!CAUTION]
><details>
><summary><strong>0.1.1 --> 2026-03-15</strong></summary>
>
>### Breaking
>
>- `stroid/core` now exports only `createStore`, `setStore`, `getStore`, and `deleteStore` (minimal primitives).
>
>### Migration
>
>- If you used `stroid/core` for batching, reset, or hydration — import those from `stroid` instead.
>
>### Add
>
>- Public feature installer entrypoints and a `features` option bag for custom feature registration.
>- Optional structural sharing via `configureStroid({ mutatorProduce })` (supports a global Immer shim).
>- `strictAsyncUsageErrors` to throw on async usage errors when enabled.
>
>### Change
>
>- SSR request APIs are now fully typed; `snapshotStrategy` drives the default snapshot mode.
>- Config is registry-scoped to avoid cross-request bleed in SSR.
>- Transaction snapshot caching scoped to the active batch.
>- Internal layering tightened; added guard against restricted lifecycle imports.
>
>### Fix
>
>- Chunked flush delivery no longer mixes snapshots within a single notification.
>- Persist sequencing avoids stale writes when debounce timers overlap.
>- Notification queues and batch depth are registry-scoped for SSR safety.
>- DTS build succeeds with a type-safe internal cast for SSR options merges.
>- `useStore` missing-store warning moved to render time for immediate feedback.
>- Sync warns when authentication is missing or `sign` is configured without `verify`.
></details>
>
---
>[!CAUTION]
><details>
><summary><strong>0.1.0 --> 2026-03-14</strong></summary>
>
>### Add
>
>- `configureStroid({ strictMissingFeatures: true })` to hard-fail when a feature is used without its side-effect import.
>- `configureStroid({ allowUntrustedHydration: true })` to opt in to `hydrateStores` on untrusted snapshots.
>- `configureStroid({ mutatorProduce })` to plug in a structural-sharing mutator engine.
>- `getSubscriberCount`, `getAsyncInflightCount`, `getPersistQueueDepth` observability helpers.
>- `configureStroid({ assertRuntime: true })` to throw on warnings/errors.
>- `createComputed(...)` for reactive derived stores.
>- `getComputedGraph()` and `getComputedDeps()` diagnostics.
>- `configureStroid({ strictMutatorReturns: true })` to forbid mutator return values.
>- `StrictStoreMap` opt-in type mode.
>
>### Breaking
>
>- Removed `mergeStore` and `chain` from the public API.
>- `setStoreBatch` is now transactional (staged writes, atomic commit, rollback on error).
>- `createStore`, `deleteStore`, `hydrateStores` are disallowed inside a batch.
>- `hydrateStores` requires explicit trust via third argument or config.
>
>### Fix
>
>- `deleteStore` no longer emits an intermediate null notification.
>- Async fetch 60s timeout now clears on completion.
>- `clearAllStores` now removes stores created during delete hooks.
>- SSR registry isolation uses `AsyncLocalStorage`-backed registries.
>- Store names reject `__proto__`, `constructor`, `prototype`.
></details>
>
---
>[!TIP]
><details>
><summary><strong>0.0.4 --> 2026-03-06</strong></summary>
>
>### Add
>
>- Persistence recovery hooks: `persist.onMigrationFail` and `persist.onStorageCleared`.
>- Sync hardening: `sync.maxPayloadBytes` and snapshot requests for reconnecting tabs.
>
>### Change
>
>- Docs: converted repo docs into chapter-based handbook; aligned README and API chapters with real package surface.
>- Packaging: rebuilt `dist` from current `src`; fixed `stroid/react` build entry.
>
>### Fix
>
>- `hydrateStores` rejects invalid schema payloads without leaving broken store shells.
>- Middleware throws no longer poison later notifications.
>- Async lifecycle cleanup hardened (inflight metadata clears on store deletion).
></details>
>
---
>[!WARNING]
><details>
><summary><strong>0.0.3 --> 2026-03-04</strong></summary>
>
>### Fix
>
>- Persistence catches `localStorage.setItem` errors (e.g., `QuotaExceededError`) and routes to `onError`.
>- Async fetch metadata cleans up when a store is deleted.
>- `enableRevalidateOnFocus` removes focus/online listeners when the store is deleted.
>- `useSelector` memoizes with shallow equality, preventing endless re-renders.
>- Store schemas now enforced on write (`setStore`).
>- `createStore` no longer overwrites an existing store name.
>- `setStore` path updates preserve array shapes instead of converting to objects.
></details>
>
---
>[!TIP]
><details>
><summary><strong>0.0.2 --> 2026-03-03</strong></summary>
>
>### Add
>
>- SSR helpers: `createStoreForRequest` and `hydrateStores`.
>- Store helpers: `createEntityStore`, `createListStore`, `createCounterStore`.
>- Observability: `getHistory`, `clearHistory`, `getMetrics`.
>- Sync tuning: optional `channel` and `conflictResolver`.
>
>### Fix
>
>- Hydration safety around theme toggles.
></details>
>
---
>[!TIP]
><details>
><summary><strong>0.0.1 --> Initial Release</strong></summary>
>
>- tsup-minified ESM bundles with subpath outputs.
>- `useStore` selector overload with dev warning on broad subscriptions.
>- Hooks split into core/async/form modules.
>- Async focus/online revalidation helper.
>- Safety: path/type guard warnings, persist key collision warning.
>- CRC table lazy init.
></details>
>
