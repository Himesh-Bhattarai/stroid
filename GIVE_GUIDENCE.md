# Guidance Notes

This document captures design tradeoffs and current behavior for selected internals and performance concerns.

## Feature Runtime Initialization Overhead

### Why this matters
`runFeatureCreateHooks`, `runFeatureWriteHooks`, and `runFeatureDeleteHooks` each call `getFeatureRuntime("persist" | "sync" | "devtools")` before iterating `featureRuntimes`. When features are already registered, these calls are redundant and add overhead on every write.

### Current behavior
- On each hook call, the runtime fetch functions are invoked for persist/sync/devtools.
- `featureRuntimes` is then iterated and the actual hooks are called.

### Benefits of current behavior
- Ensures feature runtimes exist even if registration occurs late.
- Keeps feature initialization lazy, so unused features don’t load until needed.

### Drawbacks / tradeoffs
- Adds constant overhead on every write/hook call.
- Hot write paths pay for redundant initialization checks.

### Suggestions (no Immer)
1. Cache the “all features initialized” state:
   - Use a boolean flag like `featuresInitialized` after the first full init.
   - Subsequent hook calls skip `getFeatureRuntime` calls entirely.
2. Track runtime count changes:
   - Store a counter on registration; only re-run initialization when the counter changes.

### Help / PR Guidance: Redundant getFeatureRuntime calls in hook runners
Tag: perf

Description:
The hook runners call `getFeatureRuntime("persist" | "sync" | "devtools")` on every write/create/delete. When features are already registered, these are redundant and add overhead in hot paths.

Why:
Remove repeated initialization checks and keep hook execution minimal.

Why not:
If features can be registered after stores are created, removing pre-init could delay runtime creation until the next feature registration or leave hooks missing unless initialization is moved to registration time.

Steps:
1. Initialize feature runtimes only at feature registration time (or during registry bind).
2. Remove the pre-init calls from `runFeatureCreateHooks`, `runFeatureWriteHooks`, and `runFeatureDeleteHooks`.
3. Iterate only `featureRuntimes` in those hook runners.

Suggestion:
Replace the pre-init pattern with direct iteration:

```js
// Before (redundant pre-init)
function runFeatureWriteHooks(store, prev, next) {
  getFeatureRuntime("persist", store);
  getFeatureRuntime("sync", store);
  getFeatureRuntime("devtools", store);
  for (const runtime of featureRuntimes.values()) {
    runtime.onWrite?.(prev, next);
  }
}

// After (iterate only what exists)
function runFeatureWriteHooks(store, prev, next) {
  for (const runtime of featureRuntimes.values()) {
    runtime.onWrite?.(prev, next);
  }
}
```

## Mutator Writes via `produceClone`

### Why this matters
`produceClone` deep-clones the whole state tree on each mutator-based `setStore` call. On large trees, this is O(n) time and O(n) allocations per write.

### Current behavior
- Every mutator call clones the full store value (deep clone).
- No structural sharing or partial copy.

### Benefits of current behavior
- Simplicity and correctness.
- Guarantees immutability without external dependencies.
- Predictable behavior across environments (no proxy requirements).

### Drawbacks / tradeoffs
- Expensive for large trees and frequent writes.
- Memory pressure and GC churn on hot paths.

### Suggestions (no Immer)
1. Add an optional `setStore(name, path, value)` usage recommendation:
   - For small updates, use path writes to avoid full clones.
2. Provide an opt-in shallow-clone mutator mode:
   - Clone only the root object/array and mutate shallow paths, with explicit documentation.
   - Keeps default safe behavior but offers a performance path.
3. Provide a “partial clone” helper:
   - For known shapes, clone only the branch being updated.

## Store Hydration Allowlist (optional)

### Why this matters
Hydrating from untrusted snapshots can create stores with unexpected names and shapes. Even with name validation, some apps want a strict allowlist.

### Current behavior
- `hydrateStores` accepts any valid store name (now rejects `__proto__`, `constructor`, `prototype`).
- Invalid names are skipped with `failed[name] = "invalid-name"`.

### Benefits of current behavior
- Simple and flexible.
- Works for dynamic or unknown store sets.

### Drawbacks / tradeoffs
- If snapshots are untrusted, unwanted store creation is still possible.

### Suggestion
Add `hydrateStores(snapshot, { allowList: [...] })` to limit which store names can be created.

## Persist Crypto Contract

### Why this matters
Persist encrypt/decrypt are user-provided hooks. If they don’t round-trip, persisted state can become unreadable or silently wrong.

### Current behavior
- On store creation, encrypt/decrypt are validated using a round-trip probe.
- If the round-trip fails, persistence for that store is disabled and an error is reported.

### Benefits of current behavior
- Prevents misconfiguration from corrupting persisted data.
- Makes failures explicit early.

### Drawbacks / tradeoffs
- Misconfigured crypto now disables persistence completely.
- Edge-case: non-deterministic encrypt/decrypt pairs may be rejected even if intended.

### Suggestion
Document this contract prominently in the persist docs so users expect the round-trip requirement.
