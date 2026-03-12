# Changelog

All notable changes to this project will be documented in this file.

## Unreleased
### Added
- `configureStroid({ strictMissingFeatures: true })` option to hard-fail when a feature is requested without its side-effect registration import.
- `getSubscriberCount`, `getAsyncInflightCount`, and `getPersistQueueDepth` observability helpers in `runtime-tools`.
- `configureStroid({ assertRuntime: true })` option to throw on warnings/errors for test-time assertions.

### Changed
- Runtime now always surfaces missing feature registrations via warnings (even in production), and can throw when `strictMissingFeatures` is enabled.
- Removed `mergeStore` and `chain` from the public API; use `setStore(name, partial)` and mutator updates instead.
- Selector cache logic in React hooks is shared between `useStore` and `useSelector` to avoid duplicate implementations and ensure consistent selector identity checks.
- Feature hook context creation now avoids full object spread copies on every write/delete to reduce overhead.
- Path validation cache is capped per-store (no global cache thrash); per-store cache entries are cleared on store invalidation/reset.
- Feature runtimes now initialize on registration/bind, removing redundant per-write initialization checks.
- `useAsyncStoreSuspense` now triggers/awaits async fetches and reuses inflight promises for React Suspense integration.
- Mutator-based `setStore` now honors non-undefined return values to replace draft updates.

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
