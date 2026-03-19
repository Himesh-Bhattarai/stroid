# Closed Issues (Local Tracker)

This file mirrors the GitHub issues that would have been created for the recent bug pass.
Each entry includes a suggested title, description, and labels.

## Summary
- Total closed: 10
- Scope: Bugs 2–10 from the audit list (Bug 1 was already fixed in code)

---

### Issue 1 (Bug 2) — Selector store reads from default registry in request scope
- **Labels:** `bug`, `ssr`
- **Description:** `getSelectorStoreValueRef` and `hasSelectorStoreEntry` read from a module-level `_stores` reference, ignoring request-scoped registries. This can leak data across SSR requests.
- **Fix:** Resolve `getRegistry().stores` at call time in `src/internals/selector-store.ts`.
- **Status:** Closed

### Issue 2 (Bug 3) — Chunked flush subscriber buffer corruption
- **Labels:** `bug`, `notification`
- **Description:** Chunked delivery reused a shared subscriber buffer across ticks, causing double-notify or missed notify during rapid writes.
- **Fix:** Capture per-task subscriber snapshots in `src/notification/delivery.ts`.
- **Status:** Closed

### Issue 3 (Bug 4) — Transaction runner reinjection footgun
- **Labels:** `bug`, `ssr`, `safety`
- **Description:** Replacing the transaction runner at runtime can cause cross-request leakage.
- **Fix:** Make `injectTransactionRunner` idempotent; warn and ignore subsequent injections unless cleared first.
- **Status:** Closed

### Issue 4 (Bug 5) — Commit-phase errors not surfaced in endTransaction
- **Labels:** `bug`, `robustness`
- **Description:** Pending commit errors could be lost; commit exceptions weren’t converted into transaction errors.
- **Fix:** Catch commit errors inside `endTransaction` and set `finalError`.
- **Status:** Closed

### Issue 5 (Bug 6) — Persist sequence safety net near setItem
- **Labels:** `bug`, `persist`
- **Description:** Rapid writes could allow stale serialization to complete just before a newer write.
- **Fix:** Re-check sequence inside `writeNow` before `setItem` in `src/features/persist/save.ts`.
- **Status:** Closed

### Issue 6 (Bug 7) — Async transform Promise leaves store loading
- **Labels:** `bug`, `async`
- **Description:** If `transform` returns a Promise, the store stays `loading: true` with no error state.
- **Fix:** Apply an error state before reporting usage error in `src/async/fetch.ts`.
- **Status:** Closed

### Issue 7 (Bug 8) — Frozen selector cloning performance cliff
- **Labels:** `performance`, `devx`
- **Description:** Deep-cloning frozen state on every selector run causes O(n) overhead in dev.
- **Fix:** Add `selectorCloneFrozen` config flag (default `true` for compatibility).
- **Status:** Closed

### Issue 8 (Bug 9) — Rate limiting should be per store
- **Labels:** `bug`, `async`
- **Description:** Rate limiting keyed by cache slot allows bypass via unique `cacheKey` values.
- **Fix:** Rate limit by store name in `src/async/fetch.ts`.
- **Status:** Closed

### Issue 9 (Bug 10) — Recompute computed stores after hydrateStores
- **Labels:** `bug`, `computed`
- **Description:** Out-of-order snapshot keys can hydrate a computed store before its deps.
- **Fix:** After hydration, recompute affected computed stores in topo order.
- **Status:** Closed

### Issue 10 - SSR hooks default to global registry without RegistryScope
- **Labels:** `bug`, `ssr`, `react`
- **Description:** React hooks fell back to the default registry when `RegistryScope` was omitted, even inside `createStoreForRequest(...).hydrate(...)`. This caused SSR renders to return `null` for request-scoped stores and introduced hydration mismatches.
- **Fix:** Hooks now resolve the active request registry by default, `createStoreForRequest` exposes `registry` for explicit `RegistryScope` usage, and `stroid/server` re-exports `StoreRegistry` for clean typing.
- **Status:** Closed

