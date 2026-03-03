# Changelog

All notable changes to this project will be documented in this file.

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
