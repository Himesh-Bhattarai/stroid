# Issues

This file tracks non-bug risks and UX pitfalls that should be documented or mitigated.

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
