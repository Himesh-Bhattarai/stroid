# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

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
- Store schemas are now enforced on write (`setStore`/`mergeStore`), blocking invalid shapes at runtime instead of silently accepting them.
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
