# Issues

This file tracks non-bug risks and UX pitfalls that should be documented or mitigated.

## Open Bugs

- `resetStore` returns `{ ok: false, reason: "not-found" }` when a store exists but has no initial state (`initialStates[name]` missing).  
  **Impact:** The reason is misleading; callers may assume the store does not exist.  
  **Status:** Open (should return a distinct reason like `"no-initial-state"`).

## Footguns

- `hydrateStores(snapshot, options, trust)` requires the third positional `trust` argument (e.g. `{ allowTrusted: true }`).  
  If omitted at runtime, hydration is blocked and only a warning is emitted, which can be missed in production logs.  
  **Impact:** A no-op hydration can go unnoticed in JS or loose TS projects.

- `fetchStore` accepts a direct Promise and a Promise factory. Retries only apply to the factory form.  
  TypeScript cannot distinguish these at the type level, so passing a direct Promise silently disables retries.  
  **Impact:** Retry policies appear configured but never execute.

- SSR request isolation depends on `AsyncLocalStorage` (via `createStoreForRequest`).  
  In edge runtimes that lack ALS support, request scoping can degrade unless the environment guarantees isolation.  
  **Impact:** SSR isolation guarantees may not hold outside Node.js.

- `injectTransactionRunner` stores a module-level singleton runner.  
  If a per-request runner is injected (instead of a single ALS-backed global runner), concurrent requests can clobber each other.  
  **Impact:** Cross-request transaction state contamination in long-lived Node.js processes.

- Persist checksum defaults to `"hash"` (non-cryptographic).  
  It detects corruption but does not prevent adversarial tampering; `sha256` is opt-in and still forgeable without a secret.  
  **Impact:** Users may assume integrity guarantees that are not actually enforced.

- Sync can be forced into unauthenticated mode (`policy: "insecure"` / `insecure: true`).  
  In that mode any same-origin tab (including an XSS-compromised tab) can forge updates.  
  **Impact:** Cross-tab sync can be abused unless `authToken` or `verify` is used.

- Store name validation is strict (non-empty, no spaces, no `__proto__`/`constructor`/`prototype`), but not clearly documented.  
  **Impact:** User-controlled names can fail at runtime without clear guidance.

- `useStore("name")` without `StoreStateMap` augmentation is loosely typed (`unknown`/`StoreValue`), but reads like a typed API.  
  **Impact:** Callers may assume type safety and cast (e.g. `as number`) without compile-time protection.

- `useStore(name)` without a selector subscribes to the entire store; it re-runs on every change.  
  **Impact:** Easy to accidentally over-render; the warning is one-time per store and can be missed.

- `fetchStore` auto-creates missing stores when `asyncAutoCreate` is enabled.  
  **Impact:** Typos can create phantom stores unless auto-create is disabled.

- `setStore` shallow-merges object updates, while `replaceStore` overwrites the whole store.  
  **Impact:** Easy to pick the wrong API and accidentally drop fields.

- `resetStore` on a lazy-uninitialized store returns `{ ok: false, reason: "lazy-uninitialized" }`.  
  **Impact:** Callers who ignore the return value may assume the reset succeeded.

- `stroid/vue` and `stroid/svelte` exports are stubs (`adapterNotImplemented`).  
  **Impact:** `import { useStore } from "stroid/vue"` yields undefined and fails at call time instead of import time.

## Performance Notes

- Computed stores are topo-sorted at flush time using `getComputedOrder`.  
  The sort is scoped to affected computed stores, but in dense graphs it can still be O(n).  
  **Impact:** High computed fan-out can add per-flush overhead without incremental caching.

- `pruneAsyncCache` scans `cacheMeta` with `Object.entries(...).filter(...)`, which is O(n) in total cache slots.  
  **Impact:** Large cache maps (many stores × many cache keys) incur linear scans during pruning.

- `clearAsyncMeta` iterates over `inflight`, `requestVersion`, and `cacheMeta` separately (multiple O(n) passes).  
  **Impact:** Clearing per-store async state scales linearly with total cache size instead of store-local indices.

- `resetStore` deep-clones `initialStates[name]` on every call.  
  **Impact:** Tight-loop resets can create GC pressure on large stores.

- `pruneAsyncCache` runs after every successful `fetchStore` and scans the entire cache map each time.  
  **Impact:** High request volume with many cache slots can produce steady O(n) overhead per completion.

- Computed dependency ordering is rebuilt on every flush that touches a computed store (no dirty flag).  
  **Impact:** Topo-sorting cost repeats even when the graph hasn’t changed.

- `createSelector` deep-clones frozen state when `selectorCloneFrozen` is true (default).  
  **Impact:** Large frozen stores pay O(n) per selector recompute; dev-mode can become slow.

- `getAsyncMetrics()` reports global counters only, with no per-store breakdown.  
  **Impact:** Cannot identify slow or noisy async stores from metrics alone.

- `findColdStores()` has no configurable time window; “cold” only means never-read.  
  **Impact:** Stores read once long ago are indistinguishable from actively used ones.

## Planned

- Add a framework adapter layer for SSR registry isolation (to support evolving Next.js/Remix/edge runtimes without hard ALS coupling).
- Cache computed topo order and recompute only when the computed graph changes (dirty-flag or versioned cache).


