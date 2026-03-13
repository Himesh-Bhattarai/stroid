PHASE 1 — ARCHITECTURE RECONSTRUCTION
What problem this library solves
A TypeScript-first, framework-agnostic state management library targeting React applications that need the full modern feature set out of the box: SSR safety, persistence, cross-tab sync, async data fetching with deduplication and retry, computed/derived stores, middleware, and DevTools — all without Redux-style boilerplate.
Core design philosophy
Layered separation of concerns. The architecture is deliberately stratified:
index.ts (public surface)
    ↓
store.ts / async.ts / persist.ts / sync.ts (barrel re-exports)
    ↓
store-write / store-read / store-notify (write/read/notification engines)
    ↓
store-lifecycle / store-lifecycle/* (engine core)
    ↓
store-registry.ts (dumb data container)
    ↓
feature-registry.ts + features/* (opt-in plugins via side-effect imports)
Features are registered at import time as side-effect plugins. Nothing in the core knows about persist, sync, or devtools by name — it dispatches to whatever is registered.
Main architectural pattern
Registry-scoped proxy delegation. All state lives in StoreRegistry objects (plain JS objects). Module-level exported constants (stores, meta, subscribers, etc.) are JavaScript Proxy objects that delegate every property access to getActiveRegistry(). This is the central mechanism enabling SSR safety: a different registry is injected per request via AsyncLocalStorage, so all code that reads stores[name] automatically targets the request-scoped registry without needing to pass context through every call.
State model
Plain JS objects stored in registry.stores. Every write goes through:

sanitize() — removes non-JSON-safe values (functions, Maps, Sets, Dates → warned/stripped)
validate() — optional Zod/Yup/Joi/custom function
Middleware pipeline — can abort or transform
setStoreValueInternal() — writes to registry, dev-freezes in dev mode

Snapshot strategy is configurable per-store: "deep" (default), "shallow", or "ref".
Data flow (write path)
setStore(name, data)
    → materializeInitial (lazy factory)
    → deepClone (for mutator draft)
    → sanitizeValue
    → runMiddlewareForStore
    → normalizeCommittedState (sanitize + validate)
    → [transaction: stageTransactionValue + registerTransactionCommit]
      OR [immediate: setStoreValueInternal]
    → invalidatePathCache
    → runFeatureWriteHooks (persist save, sync broadcast, devtools record)
    → notify(name)
        → scheduleFlush (queueMicrotask)
            → flush
                → buildPendingOrder (topo-sort computeds)
                → subscribers[name].forEach(subscriber(snapshot))
MODULE MAP
store-write ──► store-lifecycle (validation, hooks, registry)
             ├─► store-notify (notify)
             └─► store-transaction (staging, commit)

store-notify ──► store-lifecycle (registry state)
              └─► computed-graph (topo ordering for flush)

store-lifecycle/registry ──► store-registry (raw StoreRegistry objects)
store-lifecycle/hooks ──► feature-registry (plugin dispatch)

features/persist ──► persist/crypto, persist/load, persist/save, persist/watch
features/sync ──► BroadcastChannel + sync clock logic
features/* ──► store-lifecycle (via context objects — no direct imports)

async-fetch ──► async-cache (inflight dedup, rate limiter)
async-fetch ──► store.ts (createStore, setStore, hasStore)

hooks-core ──► store-notify (subscribe, getSnapshot)
hooks-core ──► selectors (subscribeWithSelector)

server.ts ──► store-registry (injectCarrierRunner, injectRegistryRunner)
server.ts ──► AsyncLocalStorage

computed.ts ──► store.ts (public API — slight coupling through barrel)
computed.ts ──► computed-graph (pure graph engine)

PHASE 2 — CORE ENGINEERING AUDIT
Simplicity and Clarity — 7/10
Strengths: Each module has a clear @module header stating its layer, ownership, and what it must not know about. Naming is consistent throughout. The barrel pattern in store.ts and store-lifecycle.ts makes import tracing predictable.
Weaknesses: The proxy-delegation chain is opaque to maintainers. Accessing stores["user"] looks like a dictionary lookup but triggers 4+ function calls through Proxy → getActiveRegistry() → getActiveStoreRegistry() → _defaultRegistry. Debugging requires knowing this invisible chain. The index.ts is now clean — the duplicate export bug from the previous branch is fixed.
Production Risk: Low after the duplicate export fix.
Reliability and Consistency — 7/10
Strengths: WriteResult return type on all mutations, comprehensive error handlers, transaction semantics with staged values, rollback on failure, onError callbacks at every layer.
Weaknesses: The safety timeout in async-fetch.ts is still dead code (see Phase 6 Bug #1). The batchDepth === Number.POSITIVE_INFINITY guard in setStoreBatch is unreachable since batchDepth is always modified via Math.max(0, batchDepth ± 1).
Usability — 8/10
Strengths: Excellent overload coverage on setStore and useStore. useFormStore is a genuine DX win. namespace() helper for scoping. store() typed handle for compile-time safety. staleWhileRevalidate async option.
Weaknesses: asyncAutoCreate: true default in fetchStore silently creates phantom stores on typos — the warning exists but is suppressible.
Flexibility — 8/10
Plugin system via side-effect imports. Custom persist drivers. Middleware pipeline. Zod/Yup/Joi/custom schema adapters. Configurable snapshot modes. conflictResolver for sync. onMigrationFail strategy.
Scalability — 6/10
Weaknesses:

orderedNames.includes(computedName) in buildPendingOrder is O(n) per computed — O(n²) for large computed graphs.
Path validation cache evicts the entire store entry on overflow (> 500 paths) rather than using LRU.
clearAllStores in store-admin.ts iterates in a while(true) loop with a 10,000-pass guard. If stores are recreated during deletion, this can block the event loop.

Low Redundancy — 6/10
Confirmed duplications:

isIdentityCrypto in src/features/persist/crypto.ts vs isIdentityStringTransform in src/adapters/options.ts — same probe-based logic, different names, different fallback behavior.
MAX_SERIALIZED_LENGTH = 20_000 in src/selectors.ts is declared but never used anywhere in the file.
_hasStoreEntryInternal exported from store-read.ts is an alias for hasStoreEntryInternal from store-lifecycle.ts — both exist in the public surface.

High Cohesion / Loose Coupling — 8/10
Features access store internals only through context objects passed at hook invocation — no direct imports from feature code into store-lifecycle. The one weak point: computed.ts imports from store.js (the public barrel) rather than internal modules, creating a soft coupling through the public API layer.
State Management Integrity — 8/10
Transaction staging with stagedValues Map, commit registered as callbacks, rollback on any error. Path validation cache. devDeepFreeze in dev mode. Snapshot versioning via updateCount. Lazy store materialization. These are all sound.
Security — 7/10
Strengths: FORBIDDEN_OBJECT_KEYS for prototype pollution prevention, sensitiveData enforcement that blocks persist without encryption, crypto round-trip validation at registration time, hashState for sync integrity, sign/verify hooks for sync messages.
Weaknesses: hashState is CRC32 + MurmurHash mix — non-cryptographic, collisions are possible. The verify callback swallows errors silently: in sync.ts, a verify exception logs an error and returns early, which is fine, but a thrown exception during sign silently aborts the broadcast with no user-facing indication.
Efficiency — 6/10

deepClone called on every mutator-style setStore to produce the draft.
O(n²) flush for large computed graphs (see above).
The proxy chain adds 4+ function calls per property access — measured overhead is library-specific but meaningful in tight render loops.
executeFetch wraps Promise.race even when timeoutPromise never resolves (see Bug #1).

Observability — 8/10
getMetrics(), getAsyncMetrics(), getSubscriberCount() (in runtime-tools), getComputedGraph(), persist queue depth via feature API, updateCount and notifyCount in meta, devtools history. This is well-instrumented.
Integration Design — 8/10
React 18 useSyncExternalStore, Redux DevTools, TanStack Query stub, Zod/Yup/Joi schema adapters, SSR via AsyncLocalStorage, custom persist drivers.
Goal-Oriented Design — 8/10
The library clearly solves its stated problem. SSR isolation via AsyncLocalStorage is a genuine engineering decision, not incidental. The computed store topo-sort ensures correct update ordering. The feature plugin system keeps the core lean.
Feedback Loops — 7/10
Dev warnings with warn() / warnAlways(), Levenshtein store name suggestions on typos, WriteResult for every mutation, onError callbacks, onSet/onReset/onDelete lifecycle hooks, noSignalWarned dedup for async warnings.
Continuous Improvement Readiness — 7/10
CHANGELOG.md exists and is structured. STATUS.MD documents known gaps. The branch name (debug-test/splitting-ev) confirms this is an active development branch. The duplicate-export fix from the previous branch is present here, indicating active progress.
Documentation — 7/10
Good JSDoc module headers. README.md covers the basics. STATUS.MD is honest about gaps. No auto-generated API docs in repo (separate website). Inline JSDoc on exported types is thorough.
Fail Gracefully — 8/10
Most errors return { ok: false } or null. Subscriber errors are caught and logged. Feature hook errors are caught. Driver errors in persist are caught. The finally block in setStoreBatch ensures transaction state is always cleaned up.
Honesty of Abstractions — 7/10
The proxy-delegation pattern is transparent to consumers but opaque to maintainers. exists() in PersistSaveArgs is typed (name: string) => boolean but always called as a zero-arg closure — the parameter is never used (see Phase 7 Bug #3).

PHASE 3 — TYPE SYSTEM & DX
Type Safety: 7/10
strict: true, noImplicitAny: true in tsconfig. Path<T> and PathValue<T,P> provide deep path type safety at compile time. The StoreStateMap / StrictStoreMap ambient augmentation pattern is elegant — zero runtime cost, full compile-time validation.
Unsafe casts found:
typescript// src/computed.ts — line ~83
setStore(name, () => next as any);
// Draft cast necessary because setStore expects typed draft; any is a forced escape

// src/helpers.ts
setStore as (name: string, ...rest: any[]) => any
// Explicit loose-type escape hatch; documented as intentional

// src/store-lifecycle/hooks.ts — runFeatureWriteHooks
const ctx = Object.assign(Object.create(baseContext), {
    action, prev, next,
}) as FeatureWriteContext;
// Runtime prototype-chain cast; safe given known shape, but opaque to type system
Hidden any types:
typescript// src/store-write.ts
type KeyOrData = string | string[] | Record<string, unknown> | ((draft: any) => void);
// draft: any — necessary for untyped store names, but bypasses mutation safety

// src/features/devtools.ts
let devtools: any;
// Untyped Redux DevTools handle — acceptable given third-party type variance

// src/server.ts — createStoreForRequest
create: (name: string, data: any, options?: StoreOptions) => any
// Loose by design for server-side initialization ergonomics
Inference leaks:

useStore without selector returns T | R | null — callers without StrictStoreMap must cast.
getStore returns StoreValue | null (= unknown | null) without the type parameter unless the store is typed.
hydrateStores accepts Record<string, any> — no type checking on hydrated shapes.

API footguns:

asyncAutoCreate: true is the default — typos silently create stores.
snapshot: "ref" returns the raw live store reference; mutations on it bypass all validation, middleware, and feature hooks.
Mutator-style setStore(name, draft => { return value; }) replaces the entire store if the mutator returns — documented but counterintuitive.

Does the type system prevent misuse? Partially. Path types block invalid deep paths at compile time when stores are registered in StrictStoreMap. String store names bypass all type checking unless the ambient augmentation is set up.

PHASE 4 — ARCHITECTURAL INTEGRITY
Layer violations: None confirmed. Features access store state exclusively through the context objects passed at hook invocation.
Hidden coupling: computed.ts imports from store.js (the public barrel) rather than from internal modules (store-lifecycle.js, store-notify.js). This means computed stores depend on the public API surface, creating a soft circular-ish path: index.ts → computed.ts → store.ts → store-lifecycle.ts. This is currently benign but creates a fragile dependency on the public interface.
Circular dependencies: store-lifecycle/hooks.ts → feature-registry.ts → (features at import time → store-lifecycle.ts) — an indirect cycle managed by lazy initialization and the side-effect import pattern. Works correctly because feature initialization is deferred.
Architecture drift: The debug-test/splitting-ev branch represents an in-progress module split (store.ts → store-write.ts + store-read.ts + store-notify.ts). This version's index.ts is clean — it exports only from store.ts which itself re-exports from the split modules. The architecture is internally consistent in this build.
Assessment: Architecture is stable in concept, approaching stable in implementation. The layering is sound and the proxy-delegation pattern for SSR isolation is a genuine architectural contribution. The remaining fragility is the computed.ts → store.js coupling and the proxy performance overhead.

PHASE 5 — REAL WORLD FUNCTIONALITY
Runtime validation: Comprehensive — sanitize (removes non-JSON-safe values), validate (schema/function), path safety cache, type mismatch detection on path writes, prototype pollution prevention.
Edge cases handled:

Prototype pollution via FORBIDDEN_OBJECT_KEYS
Circular references caught in sanitize
Lazy store materialization inside transactions
SSR cross-request isolation via AsyncLocalStorage
Transaction rollback on error in finally block
Stale request detection via requestVersion versioning
Rate limiting (100 req/s per cache slot) in async layer

Error boundaries: try/catch around all subscriber callbacks, feature hooks, middleware, async operations, persist driver calls, BroadcastChannel postMessage.
Backwards compatibility: Legacy options (validator, schema, version, migrations at top level) emit deprecation warnings and still work via collectLegacyOptionDeprecationWarnings.
Migration strategy: persist.migrations record with version stepping, onMigrationFail strategy ("reset"/"keep"/function), checksum validation before migration.

PHASE 6 — FAILURE ANALYSIS
BUG #1 — CONFIRMED: Safety timeout is still dead code
File: src/async-fetch.ts
Lines: ~330–345
typescriptconst controller = !signal && typeof AbortController !== "undefined"
    ? new AbortController()
    : null;
const mergedSignal = signal || controller?.signal;
// ^ When no user signal: controller is created, controller.signal is truthy
// So mergedSignal is ALWAYS truthy when called without a signal.

const timeoutPromise = new Promise<...>((_, reject) => {
    if (mergedSignal) return;   // ← ALWAYS returns early — timeout NEVER fires
    timeoutId = setTimeout(() => {
        reject(new Error("Timeout: async request hung for 60 seconds"));
    }, 60000);
});
Why it happens: An AbortController is created when no user signal is provided (line: const controller = !signal && ... ? new AbortController() : null). Then mergedSignal = signal || controller?.signal — since controller is non-null, controller.signal is truthy, making mergedSignal always truthy. The timeout guard if (mergedSignal) return then always fires, preventing the 60-second timeout from ever being set.
Production impact: Any fetchStore call without an explicit signal that hangs (e.g., server not responding, network partition) will hang indefinitely. The store stays in loading: true forever. No timeout, no error state, no recovery.
Fix:
typescript// Check the ORIGINAL user signal, not the merged one:
const timeoutPromise = new Promise<...>((_, reject) => {
    if (signal) return;  // user provided their own signal — don't add timeout
    timeoutId = setTimeout(() => reject(...), 60000);
});

BUG #2 — CONFIRMED: O(n²) flush for large computed graphs
File: src/store-notify.ts
Lines: ~80–95, buildPendingOrder function
typescriptconst computedOrder = getTopoOrderedComputeds(orderedNames);
for (const computedName of computedOrder) {
    if (pendingSet.has(computedName) && !orderedNames.includes(computedName)) {
        //                                              ↑ O(n) linear scan per computed
        orderedNames.push(computedName);
    }
}
Why it happens: orderedNames is a plain array. orderedNames.includes(computedName) is O(n) — called once per computed in computedOrder. With 500 computeds and 1000 stores, this is up to 500,000 comparisons on every flush cycle.
Production impact: Significant CPU cost at scale. In applications with large computed graphs, this fires on every state change.
Fix:
typescriptconst orderedSet = new Set(orderedNames);
for (const computedName of computedOrder) {
    if (pendingSet.has(computedName) && !orderedSet.has(computedName)) {
        orderedNames.push(computedName);
        orderedSet.add(computedName);
    }
}

BUG #3 — CONFIRMED: exists parameter in PersistSaveArgs signature mismatch
File: src/features/persist/save.ts, src/features/persist/types.ts, src/features/persist.ts
typescript// types.ts — PersistSaveArgs type declaration:
exists: (name: string) => boolean;   // typed to accept name

// persist.ts — actual call sites:
exists: () => ctx.hasStore(),        // zero-arg function passed — name is never used
Why it matters: TypeScript permits this (a zero-arg function is assignable to a single-arg function type), so no compile error occurs. But the name parameter in the type is misleading — the caller cannot use it to check a different store, because the closure already captures the specific store name. The interface lies about its own contract.
Production impact: None at runtime. But it signals an incomplete API design — if a caller ever passes a different implementation expecting name to be the store name, it will get a function that ignores its argument.
Fix: Change the type to exists: () => boolean to match actual usage.

BUG #4 — CONFIRMED: _wildcardCleanups memory leak on repeated wildcard registrations
File: src/async-fetch.ts
typescriptconst _wildcardCleanups: Array<() => void> = [];
// Module-level array. Grows with each enableRevalidateOnFocus("*") call.
// revalidateKeys.has(key) prevents duplicate registration for the same key,
// but _wildcardCleanups.push(cleanup) still runs on first call.
// cleanupAllRevalidateHandlers is exported but NOT called automatically.
Production impact: Low in typical apps (called once), but in test environments or SSR scenarios where the module is re-evaluated, this can grow unbounded. The cleanupAllRevalidateHandlers export is the escape valve but callers must know to invoke it.
Fix: Ensure cleanupAllRevalidateHandlers is called from _resetAsyncStateForTests (already partially present), and document the manual cleanup requirement in production teardown scenarios.

BUG #5 — CONFIRMED: isIdentityCrypto duplicated with behavioral divergence
File A: src/features/persist/crypto.ts
typescriptexport const isIdentityCrypto = (fn: (v: string) => string): boolean => {
    try {
        const probe = "__stroid_plaintext_probe__";
        return fn(probe) === probe;
    } catch (_) {
        const src = fn.toString().replace(/\s/g, "");
        return src === "v=>v" || src === "(v)=>v" || src === "function(v){returnv;}";
    }
};
File B: src/adapters/options.ts
typescriptconst isIdentityStringTransform = (fn: (v: string) => string): boolean => {
    try {
        const probe = "__stroid_plaintext_probe__";
        return fn(probe) === probe;
    } catch (_) {
        try {
            const src = fn.toString().replace(/\s/g, "");
            return src === "v=>v" || src === "(v)=>v" || src === "function(v){returnv;}";
        } catch (_) {
            return false;       // ← File B has an extra try/catch wrapping toString()
        }
    }
};
Why it matters: File A's fallback does not wrap toString() in a try/catch. If fn.toString() throws (e.g., in some proxy-wrapped function scenarios), File A throws while File B returns false. They disagree on the fallback contract. As these are used in different parts of the same persist feature, a discrepancy will produce inconsistent behavior depending on which code path reaches first.

BUG #6 — CONFIRMED: Computed store re-registration does not clean up stale subscriptions
File: src/computed.ts
typescriptexport const createComputed = (name, deps, compute, options) => {
    const registered = registerComputed(name, deps, compute);  // updates graph entry
    // ...
    const unsubscribers: Array<() => void> = [];
    for (const dep of deps) {
        const unsub = subscribeStore(dep, () => {
            _recomputeAndFlush(name, deps, compute, options.onError);  // ← old closure
        });
        unsubscribers.push(unsub);
    }
    getComputedCleanups().set(name, () => {
        unsubscribers.forEach((fn) => fn());
        unregisterComputed(name);
    });
    // ...
};
Why it happens: registerComputed in computed-graph.ts updates the graph entry with new deps and compute when called for an already-registered name (lines: if (entries[name]) { removeComputedDependentLinks... } entries[name] = { deps, compute, stale: true }). However, createComputed does NOT call deleteComputed first. The old subscribeStore listeners from the first registration are still active and still hold references to the original deps and compute closures. Both old and new subscriptions now fire, causing double-recomputation, and the old subscriptions reference a stale compute function.
Production impact: If createComputed is called twice for the same name (common in React Strict Mode's double-invoke or hot reload), the store recomputes twice per dependency change with potentially two different compute functions, leading to stale results and extra renders.
Fix:
typescriptexport const createComputed = (name, deps, compute, options) => {
    // Clean up existing subscriptions before re-registering
    if (getComputedCleanups().has(name)) {
        deleteComputed(name);
    }
    // ... rest of registration
};

BUG #7 — CONFIRMED: Path validation cache evicts entire store on overflow
File: src/store-lifecycle/validation.ts
Lines: ~135–145
typescriptif (!hadVerdict) {
    const nextCount = (pathCounts.get(storeName) ?? 0) + 1;
    pathCounts.set(storeName, nextCount);
    if (nextCount > MAX_PATH_CACHE_ENTRIES_PER_STORE) {
        pathCache.delete(storeName);    // ← Deletes ALL cached paths for the store
        pathCounts.delete(storeName);
    }
}
Production impact: A form store with 500+ unique field paths (not uncommon in complex forms or dynamic field arrays) will trigger constant cache thrashing: every 500th path write clears the entire store's path cache, forcing re-validation of all subsequent paths from scratch on each write.
Fix: LRU eviction rather than full store eviction, or raise the limit to 2000 with a configurable override.

BUG #8 — CONFIRMED: snapshot: "ref" allows silent store corruption
File: src/store-notify.ts
typescriptconst cloneSnapshot = (value: StoreValue, mode: SnapshotMode): StoreValue => {
    if (mode === "ref") return value;  // ← Returns live store reference
    if (mode === "shallow") return shallowClone(value);
    return deepClone(value);
};
Production impact: Any subscriber or React component that mutates the returned object directly corrupts the store state. All subsequent reads return the mutated state. All feature hooks (persist, sync, devtools) are bypassed. Validation does not run. No updateCount increment. No notifications. The store silently diverges from its own history.
Note: This may be POTENTIALLY INTENTIONAL DESIGN for performance-critical scenarios. But there is no dev-mode warning when mutations are detected on a "ref" snapshot, making silent corruption easy.

BUG #9 — CONFIRMED: Transaction state is module-level singleton, not registry-scoped
File: src/store-transaction.ts
typescriptconst state: TransactionState = {
    depth: 0,
    pending: [],
    stagedValues: new Map(),
    failed: false,
    error: undefined,
};
Why it matters: On the server with multiple concurrent requests, each using createStoreForRequest with distinct registries, the transaction state is shared across all requests. If Request A calls setStoreBatch() while Request B is already inside setStoreBatch(), they will share batchDepth, stagedValues, and pending commits. This is a race condition that can cause committed values from one request to bleed into another.
Production impact: High severity in SSR environments with high concurrency. Incorrect data served to users; potential security issue if user-specific data crosses request boundaries.
Fix: Move transaction state into the StoreRegistry object, scoped per registry, and access it through the active registry proxy pattern already used by stores, meta, etc.

BUG #10 — CONFIRMED: clearAllStores 10,000-pass infinite loop guard is too high
File: src/internals/store-admin.ts
typescriptconst clearAllStores = (): string[] => {
    let pass = 0;
    while (true) {
        const names = Object.keys(stores);
        if (names.length === 0) break;
        names.forEach((name) => {
            if (hasStoreEntry(registry, name)) {
                deleteExistingStore(name);
                removed.push(name);
            }
        });
        pass += 1;
        if (pass > 10_000) break;
    }
    // ...
};
Production impact: If stores are being recreated during deletion (e.g., via onCreate lifecycle hooks, computed stores triggering on deletion), the loop runs 10,000 full iterations before breaking. At scale with hundreds of stores, this could block the event loop for hundreds of milliseconds.
Fix: Reduce guard to 10 passes; emit a critical() warning if stores are recreating during clear, as this indicates a lifecycle hook misconfiguration.

PHASE 7 — BUG HUNT MODE (ADVERSARIAL)
BUG A — CONFIRMED: Double-deepClone on mutator path
File: src/store-write.ts
typescript// Mutator path:
const draft = deepClone(prev);                    // Clone 1
const result = keyOrData(draft);
// ...
updated = result !== undefined ? result as StoreValue : draft;
// Then later:
const next = runMiddlewareForStore(storeName, { ..., next: updated });
const committed = normalizeCommittedState(storeName, next, validateRule);
// normalizeCommittedState calls sanitizeValue which calls sanitize()
// sanitize() calls deepClone internally on object values
Every mutator-style setStore call performs at minimum two deep clones: one for the draft, and one inside sanitize. For large state trees, this doubles allocation pressure on every write.
POTENTIALLY INTENTIONAL DESIGN — correctness requires the draft to be isolated. However, if middleware is not present, the second clone in sanitize could be skipped by checking whether the value is already clean.

BUG B — CONFIRMED: MAX_SERIALIZED_LENGTH declared but never used
File: src/selectors.ts
typescriptconst MAX_SERIALIZED_LENGTH = 20_000;
// Declared at line ~195, never referenced anywhere in the file.
Dead code. Indicates an incomplete implementation — likely intended for a serialized selector cache size limit that was never wired up.

BUG C — CONFIRMED: getStoreAdmin export in store-lifecycle.ts returns a proxy of a proxy
File: src/store-lifecycle/registry.ts
typescriptexport const storeAdmin = createRegistryValueProxy(
    () => getStoreAdminForRegistry(getActiveRegistry())
);
export const getStoreAdmin = (): typeof storeAdmin => storeAdmin;
storeAdmin is itself a Proxy. getStoreAdmin() returns that proxy. Callers then call methods on a proxy of a proxy. Any method call on storeAdmin.clearAllStores() goes through: outer proxy → getStoreAdminForRegistry(getActiveRegistry()) → inner result, then the method is called. This adds indirection but is technically correct. However, the typeof storeAdmin return type is the proxy type, not the underlying admin type — if TypeScript inlines the proxy, callers get surprising type information.
POTENTIALLY INTENTIONAL DESIGN — the proxy is needed for SSR registry switching.

BUG D — CONFIRMED: setStore transaction path calls notify before commit
File: src/store-write.ts
typescriptif (isTransactionActive()) {
    stageTransactionValue(storeName, nextValue);
    registerTransactionCommit(() => {
        setStoreValueInternal(storeName, nextValue);
        // ...
    });
    notify(storeName);  // ← Called before commit — store still has OLD value
}
When inside a setStoreBatch, notify(storeName) fires before setStoreValueInternal runs. The notification triggers scheduleFlush, which batches (since batchDepth > 0). The flush only runs after endTransaction completes and batchDepth returns to 0. So the actual subscriber delivery is deferred correctly. However, getStoreSnapshot called during the batch (e.g., by a React component triggered by another store's notification) will return the pre-transaction snapshot with the current updateCount version. This is correct but subtle and undocumented — callers who call getStore() synchronously inside a batch will see staged values (via getStoreValueRef → getStagedTransactionValue), but getStoreSnapshot will return the pre-commit version. The two APIs are intentionally inconsistent inside a batch.
POTENTIALLY INTENTIONAL DESIGN — the asymmetry exists to support React's useSyncExternalStore tearing detection.

PHASE 8 — TEST SUITE AUDIT
Score: 7/10
Structure: Node.js built-in test runner (node:test), no external framework. Tests organized by feature area with a shared setup.ts. Type tests in tests/types/ as compile-time assertions. Heavy stress tests in tests/heavy/.
Coverage strengths:

Core CRUD, subscriptions, batch operations, transactions
Async: deduplication, race conditions, retry with backoff, abort, cache TTL, staleWhileRevalidate
Persist: encryption, migration, checksum, driver errors, version stepping
Sync: BroadcastChannel mock, conflict resolution, protocol versioning, clock ordering
SSR: carrier context, registry isolation, concurrent requests
React hooks: useSyncExternalStore integration, selector memoization, equality functions
Type tests with compile-time assertions

Critical behaviors NOT tested:

Safety timeout bypass (Bug #1) — No test for a hung request without a user signal verifying that the 60-second timeout actually fires.
Transaction state as module-level singleton (Bug #9) — No test for concurrent setStoreBatch calls across two different registry scopes (SSR race condition).
Computed store re-registration (Bug #6) — No test for createComputed called twice for the same name, verifying that stale subscriptions are cleaned up.
snapshot: "ref" mutation corruption — No test mutating the returned reference and verifying store corruption occurs (to document the known risk).
clearAllStores with stores recreating during deletion — No test that would reveal the 10,000-pass hazard.
isIdentityCrypto vs isIdentityStringTransform divergence — No test covering a proxy-wrapped encrypt function that throws on toString().
Path cache eviction under high churn — No test with 501+ unique paths to verify cache eviction behavior.
_wildcardCleanups accumulation — No test for repeated enableRevalidateOnFocus("*") calls verifying cleanup.
enableRevalidateOnFocus idempotency — The revalidateKeys.has(key) guard is tested implicitly but not explicitly.
Double-deepClone on mutator path — No performance test quantifying allocation cost on large stores.

Positive note: tests/heavy/ tests cover memory stress, snapshot cache scale, sync scale, and environment edge cases — this is a cut above typical state management library test suites.

PHASE 9 — DESIGN COMPARISON
vs Redux
Superior: Zero boilerplate (no actions/reducers/selectors setup). Built-in async, persist, sync, computed. StrictStoreMap ambient augmentation provides comparable type safety with less ceremony.
Weaker: No time-travel debugging (history is append-only). No standardized action dispatch log (middleware is opaque). Redux ecosystem (RTK, redux-saga, redux-observable) has 10+ years of production hardening.
Reinvents: Middleware pattern (Redux middleware is a more composable standard). DevTools integration.
vs Zustand
Superior: SSR-safe by design via AsyncLocalStorage. Built-in persist/sync/async layers. Path-based writes with type safety. Computed stores with topo-ordered updates.
Weaker: Zustand's core is 200 lines — its simplicity is a deliberate feature. Stroid's core is significantly more complex, and complexity is a maintenance liability. Zustand's immer middleware is more ergonomic for nested mutations.
Reinvents: subscribeWithSelector pattern (Zustand has this too). Persist middleware (Zustand has zustand/middleware).
vs Jotai
Superior: String-keyed stores are easier for dynamic/SSR use cases. Richer persistence and sync story out of the box.
Weaker: Jotai's atom composition is more fine-grained — derived atoms are type-safe by construction without needing a separate createComputed. Jotai has better React Suspense integration (atoms can throw promises natively).
Reinvents: Derived state (Jotai's approach is more composable).
vs Valtio
Superior: Explicit write API prevents accidental mutation. SSR-safe. Schema validation.
Weaker: Valtio's proxy-based auto-tracking (no explicit selector needed) is more ergonomic for simple cases. Stroid requires explicit selectors for performance.
vs Signals (Preact/SolidJS)
Superior: Framework-agnostic. Richer feature set. SSR story is clearer.
Weaker: No fine-grained reactivity. Signals track exact dependencies at the value level; stroid tracks at the store level.
Strongest unique ideas vs the field

Registry-scoped SSR isolation via AsyncLocalStorage — none of the compared libraries solve this as cleanly.
StrictStoreMap ambient augmentation — compile-time store type safety without runtime overhead is genuinely novel.
Feature plugin system via side-effect imports — zero tree-shaking penalty; dead features are not included in bundles.
Configurable snapshot modes per store — allows performance tuning without changing the API.


PHASE 10 — FINAL VERDICT
OVERALL SCORE: 6.5/10
Is this production ready?
Not fully. Two issues remain blocking for serious production use:

The safety timeout in async-fetch.ts is dead code. Hung requests have no recovery path.
The transaction state in store-transaction.ts is a module-level singleton. On any SSR workload with concurrent requests, this is a data integrity and security risk.

After fixing those two issues, stroid becomes a conditionally strong choice for small-to-medium applications with SSR requirements. For high-scale systems, the O(n²) flush and proxy overhead require profiling first.
Would you adopt this in a serious system?
After targeted fixes, yes — for a specific niche. If your application requires SSR safety, built-in persistence, cross-tab sync, and async state management without wanting Redux's boilerplate or Zustand's manual plumbing, stroid offers genuine value. It is not ready as a drop-in Zustand replacement for all use cases.
Biggest risks

Transaction singleton on the server — concurrent requests sharing transaction state is a correctness and security failure in production SSR.
Hung async requests — the timeout bypass means any network-level hang leaves the UI permanently in a loading state with no escape.
Proxy performance at scale — 4+ function calls per property access on stores, meta, subscribers fires thousands of times per render cycle; this has not been benchmarked against the library's own performance claims.

Strongest ideas

AsyncLocalStorage-based registry isolation — the cleanest SSR isolation mechanism of any state library in this comparison set.
StrictStoreMap ambient augmentation — zero-cost compile-time type enforcement is an underrated DX innovation.
Feature plugin system via side-effect imports — bundle-size-safe opt-in architecture.
Topo-sorted computed flush — correct and elegant; computed stores always update after their dependencies.


3 BRUTAL TRUTHS
1. The server is broken by design.
src/store-transaction.ts is a module-level singleton. On a Node.js server with concurrent requests, setStoreBatch from Request A and Request B share the same batchDepth, stagedValues, and pending array. This is not a hypothetical edge case — it is a certainty in any production SSR environment under load. Committed values from one user's request can be staged in another user's transaction. The library has sophisticated per-registry SSR isolation everywhere else, and this one module undoes it.
2. The safety net is an illusion.
The 60-second safety timeout in fetchStore has never fired in production. Ever. The AbortController that gets created when no user signal is provided makes mergedSignal truthy, which causes if (mergedSignal) return to exit before setTimeout is called. The comment says "Timeout: async request hung for 60 seconds without an AbortSignal." The code says "I will hang forever." The bug has survived at least two branch iterations.
3. The architecture taxes every render.
Every time a React component reads store state, the code path traverses: useSyncExternalStore → getStoreSnapshot → cloneSnapshot → (for deep mode) deepClone plus: getStoreSnapshot → meta[name] → Proxy.get → getActiveRegistry() → getActiveStoreRegistry(_defaultRegistry) → currentRegistryRunner?.get() || fallback. This is 6–8 function calls before any application logic runs, on every render, for every subscribed store. The library has not published benchmarks against Zustand or Jotai at component scale. Before committing to stroid in a component-heavy application, this needs measurement — not assumption.