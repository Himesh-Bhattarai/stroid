# STROID v0.0.5 — BRUTAL PRODUCTION AUDIT REPORT

> **Auditor's Note:** This is a deep adversarial engineering audit. Nothing here is diplomatic. Everything here is true.

---

## PHASE 1 — REPOSITORY OVERVIEW

### What Problem This Solves

Stroid is a **named-store global state engine** for JavaScript and React. The core premise: instead of importing store instances like Zustand, you reference stores by name strings. State lives in a named global registry. You call `createStore("user", {...})`, then `setStore("user", "name", "Ava")` anywhere in the app — no import chains, no Provider wrapping, no atom graph.

It competes in the crowded React state management space (Zustand, Jotai, Redux Toolkit, Valtio) but carves a different lane: **flat named stores** instead of imported closures or provider contexts.

**Core feature set shipped:**
- Named store registry (create, read, write, delete, reset)
- Dot-path reads/writes with type inference up to depth 10
- Draft-mutator pattern (like Immer, but manual clone)
- Computed derived stores with DAG cycle detection
- Async fetch layer with TTL cache, deduplication, retries
- BroadcastChannel cross-tab sync with lamport-clock conflict resolution
- localStorage/custom driver persistence with migrations, checksums, crypto hooks
- React hooks via `useSyncExternalStore`
- SSR per-request registry isolation (AsyncLocalStorage-backed)
- Middleware pipeline
- DevTools integration
- Transaction batching (`setStoreBatch`)
- Feature plugin system

### Core Design Philosophy

**Convention over import.** The philosophy is that stores are global named singletons, not module-level instances. This eliminates Provider hell and makes stores accessible from anywhere — including outside React. The trade-off: it shifts type safety from module imports to string names (mitigated via `StrictStoreMap` and `StoreDefinition` handles).

### Main Architectural Pattern

**Layered registry architecture with proxy-backed scope switching:**

```
index.ts (public API)
  └─ store-write / store-read / store-notify (write/read/pub-sub layer)
       └─ store-lifecycle (dispatch engine, validation, hooks)
            └─ store-lifecycle/registry (proxy-backed scoped registry state)
                 └─ store-registry (dumb data container factory)
```

Features (persist, sync, devtools, lifecycle hooks) register against a **feature plugin registry** (`feature-registry.ts`) and are activated by importing their side-effect modules. They hook into create/write/delete lifecycle events via `runFeatureCreateHooks`, `runFeatureWriteHooks`, `runFeatureDeleteHooks`.

The SSR isolation strategy is clever: a `Proxy` layer in `store-lifecycle/registry.ts` intercepts all reads/writes and routes them to the **active** registry (thread-local via AsyncLocalStorage), so the same module-level variable names work correctly in per-request scopes without changing any code at the call site.

### Data Flow and Control Flow

**Write path:**
```
setStore("name", path, value)
  → materializeInitial (lazy stores)
  → sanitizeValue (prototype-pollution guard, type check)
  → transaction staging (if inside setStoreBatch)
  → runMiddlewareForStore (optional veto)
  → normalizeCommittedState (schema validation)
  → setStoreValueInternal (proxy → active registry)
  → invalidatePathCache
  → runFeatureWriteHooks (persist save, sync broadcast, devtools snapshot)
  → notify(name) → scheduleFlush() (microtask)
  → subscribers called with snapshot clone
```

**React read path:**
```
useStore("name", path)
  → useSyncExternalStore(subscribe, getSnapshot)
  → getStoreSnapshot → snapshotCache or fresh deepClone
  → devDeepFreeze (dev mode)
  → pickPath
  → return to component
```

### Overall Impression

**Verdict: Architecturally Sound but Pre-Production**

Not experimental. Not a prototype. But not production-ready at v0.0.5 either. This is **a thoughtfully designed library in the final stages of hardening before a real v1 release**. The architecture is more mature than the version number implies. The CI is thin. Tests are meaningful but incomplete in critical areas. The public API has already changed substantially between 0.0.1–0.0.5 and will change again.

---

## PHASE 2 — CORE ENGINEERING QUALITY

### 1. Simplicity and Clarity — Score: 7/10

**Strengths:**
- Public API surface is genuinely small. `createStore`, `setStore`, `getStore`, `useStore` covers 90% of use cases.
- Module `@module` doc-comment headers clearly state layer ownership and what each module does NOT know about. This discipline is rare and valuable.
- File naming follows predictable patterns: `store-write.ts`, `store-read.ts`, `store-notify.ts`.

**Weaknesses:**
- `store-write.ts` is a 516-line function factory that concatenates three conceptually separate modules (the file is literally built by concatenating `store-write`, `store-read`, and `store-notify` into `store.ts` at export time). This is deeply confusing. A reader of `store.ts` sees a 1400+ line file with no clear structure.
- `utils.ts` is 702 lines covering: hashing, cloning, equality, path traversal, type guards, warning system, and schema validation. This is a dumping ground.
- The Proxy architecture in `store-lifecycle/registry.ts` is correct but makes debugging production issues extremely hard — the proxy layer obscures what is actually being read/written when you step through a debugger.
- Optional feature activation via side-effect imports (`import "stroid/persist"`) is an **enormous** footgun documented as "#1 onboarding footgun" in the README. If you forget the import, features silently do nothing in production.

**Risks:**
- Silent feature failures are the worst class of production bug. A developer ships persist, it silently does nothing, and they don't notice until user data is lost.

**Improvements:**
- Break `utils.ts` into `utils/clone.ts`, `utils/hash.ts`, `utils/path.ts`, `utils/validation.ts`.
- Add a `configureStroid({ strictFeatures: true })` that makes missing feature imports throw, not warn.

---

### 2. Reliability and Consistency — Score: 7/10

**Strengths:**
- `createStore` returns `undefined` on failure. Every write path returns `WriteResult { ok, reason }`. Errors never throw by default — they route to `onError`. This is correct library behavior.
- Prototype pollution is explicitly blocked: `__proto__`, `constructor`, `prototype` are forbidden store names. `FORBIDDEN_OBJECT_KEYS` is enforced in cloning, hashing, and path validation.
- Transaction semantics are sound: staged writes are only committed on success. Failed batches are fully rolled back.
- The snapshot cache uses `updateCount` (monotonic version counter) rather than timestamps, avoiding clock-skew bugs in cache invalidation.

**Weaknesses:**
- The `meta[name].updatedAt` field is set with `new Date().toISOString()` — a string date. This is used in sync conflict resolution. Two concurrent writes at the same millisecond can produce identical `updatedAt` strings. The Lamport clock (`syncClocks`) correctly supplements this, but `updatedAt` being a string makes comparison fragile.
- `resetStore` silently does nothing if called on a lazy store before it's materialized (`!initialStates[name]`). The warning message explains why but returns void — the caller gets no `WriteResult` feedback.
- Feature hooks run with `runStoreHookSafe` which catches errors but swallows them with a warn. A failing `onCreate` hook is silent beyond a console warning. No `onError` routing.

**Risks:**
- Silent persist failure in production (quota exceeded, driver error) is surfaced through `onError` but if `onError` isn't wired, it vanishes.

---

### 3. Usability — Score: 7/10

**Strengths:**
- `setStore("user", "profile.name", "Ava")` dot-path API is extremely intuitive.
- `setStore(storeDef, draft => { draft.count++ })` mutator pattern feels natural.
- React hooks require no Provider. Works server-side. Works outside React.
- `store("user")` handle pattern gives TypeScript autocomplete without importing the store definition.

**Weaknesses:**
- The feature side-effect import requirement is a hidden contract that breaks real apps silently. This is not a usability footnote — it is a category-1 DX failure.
- `createStore` returns `undefined | StoreDefinition`. The `undefined` return on failure forces null-checks everywhere if you use the return value. The docs say "prefer literal names" to avoid this, but that dodges the issue.
- The `StrictStoreMap` type is the right solution for compile-time store safety, but it requires manual declaration merging. It's a power-user feature hidden in the TypeScript guide.
- No way to get a list of all store names at runtime without using `runtime-tools` internals.

---

### 4. Flexibility and Adaptability — Score: 8/10

**Strengths:**
- The feature plugin system (`feature-registry.ts`) allows third-party features to hook into create/write/delete lifecycle. This is genuinely extensible.
- Custom persist drivers (any object with `getItem`/`setItem`) enable localStorage, sessionStorage, custom backends.
- Schema validation accepts Zod, Yup, Joi, or custom functions — the duck-typing dispatch in `runSchemaValidation` covers all major validators.
- `configureStroid()` exposes flush tuning, default snapshot mode, log sinks, and strict mode flags.
- SSR registry isolation is a first-class feature, not an afterthought.

**Weaknesses:**
- Middleware is store-level only, not a global pipeline. You can't intercept all store writes from one place.
- `computedStore` dependencies are strings, not typed handles. Type safety breaks at the computed boundary.
- `fetchStore` is tightly coupled to an `AsyncState` shape (`{ data, loading, error, status }`). You cannot use `fetchStore` with a custom state shape — it will overwrite your store with its own shape.

---

### 5. Scalability — Score: 6/10

**Strengths:**
- Subscriber notification is microtask-batched. Multiple writes in one sync tick produce one flush.
- Chunked delivery (`chunkSize`, `chunkDelayMs` config) prevents large subscriber counts from blocking the main thread.
- Priority store notifications allow critical stores to flush before others.
- Snapshot caching (`snapshotCache` with version-based invalidation) prevents redundant deep-clones across multiple subscribers.

**Weaknesses:**
- **Every store is a global singleton.** In a large app with 100+ stores and thousands of components, the registry becomes a single point of contention. There's no namespaced sub-registry for feature modules.
- The path validation cache (`pathValidationCache`) is capped per-store but the implementation does not enforce a size limit — it clears the entire cache on each store invalidation. For stores updated frequently, this causes repeated path re-validation.
- `inflight` requests are keyed by `name:cacheKey`. With 1000 users each with a unique ID, this is 1000 keys in the inflight map that aren't cleaned up until after the request resolves. Under concurrent load, this is a memory concern.
- `getTopoOrderedComputeds` runs Kahn's algorithm on every flush. For large computed graphs (20+ nodes), this is O(V+E) on every state change. No memoization of the topological order.

**Risks:**
- At 50+ stores with 500+ subscribers, the single global registry becomes a bottleneck. There's no evidence of stress testing at that scale despite the `heavy/` test directory.

---

### 6. Low Redundancy — Score: 6/10

**Weaknesses (this is where it really hurts):**
- `store-write.ts` concatenates `store-read.ts` and `store-notify.ts` into a single export — these are literally the same module re-exported from `store.ts` through `core.ts`. The triple re-export chain (`store-read.ts` → `store.ts` → `core.ts` → `index.ts`) serves routing but creates 4 files that all expose the same functions.
- `subscribeInternal` is aliased to `subscribeStore` which is aliased to `subscribe`. Three names for one function, exported under all three names.
- `getSnapshot` is aliased to `getStoreSnapshot`. Two names, both exported.
- `CHANGELOG.md` lists "Removed `mergeStore` and `chain`" but residual `replaceStore` (which is not documented in the public-facing README) still exists in the codebase. One function (`replaceStore`) is public but undocumented.
- The `feature-applied-state.test.ts` test file is 60 lines and tests behavior already covered by `persist.test.ts` and `sync.core.test.ts`.

---

### 7. High Cohesion, Loose Coupling — Score: 7/10

**Strengths:**
- Module header comments enforce a "DOES NOT KNOW about" contract. `store-notify` explicitly does not know about features. `store-write` explicitly does not know about React.
- Feature plugins interact via context objects (dependency injection), not direct imports.

**Weaknesses:**
- `computed.ts` imports from `store-write.ts` (`createStore`, `replaceStore`) AND `store-read.ts` (`getStore`) AND `store-notify.ts` (`subscribeStore`) — three layers in one file. It's bounded but touches everything.
- `async-fetch.ts` (708 lines) is monolithic. Rate limiting, cache management, deduplication, retry logic, abort handling, and response parsing all live in one file. The `async-cache.ts` extraction helps but is incomplete.
- `utils.ts` violates cohesion entirely — it is a collection of unrelated utilities.

---

### 8. State Management — Score: 8/10

**Strengths:**
- Immutable-by-default reads: `getStore` deep-clones unless `snapshot: "ref"`. Components never mutate store state accidentally.
- Dev mode deep-freezes snapshots (`devDeepFreeze`) to catch accidental mutations immediately.
- Transaction batching stages writes and commits atomically. Failed transactions roll back completely.
- Lazy stores defer initialization until first access.
- `resetStore` restores exact initial state (deep-cloned), not a reference.

**Weaknesses:**
- The mutator draft pattern clones the entire store state before applying mutations. For large stores (deep object trees), this is expensive — there's no structural sharing (no Immer). A 10MB store state means a 10MB clone per write.
- `setStore(name, partialObject)` is a shallow merge, not a deep merge. This is correct but unintuitive. `setStore("user", { profile: { name: "Ava" } })` replaces `profile`, it does not merge it.
- No selector subscription optimization at the store level (only at the React hook level via `useSelector`). Vanilla `subscribe` delivers the entire store snapshot to every subscriber.

---

### 9. Robust Security — Score: 7/10

**Strengths:**
- Prototype pollution prevention is thorough: forbidden keys in store names, path traversal, cloning, and hashing.
- `sanitizeValue` strips functions, undefined, and validates types before storing.
- Persist crypto validation (`validateCryptoPair`) round-trip tests encrypt/decrypt on registration.
- `isIdentityCrypto` detects no-op crypto hooks to warn about plaintext persistence.
- BroadcastChannel messages are validated with `isValidSyncMessage` before processing — unknown message shapes are dropped.

**Weaknesses:**
- **Persist crypto is synchronous only.** Real-world encryption (AES-GCM via WebCrypto) is async. The current crypto API accepts `(v: string) => string` — no async support. Users who want real encryption must do it outside (serialize then encrypt), which the docs don't guide well.
- `hashState` is a non-cryptographic checksum used for persist integrity. It will not detect malicious tampering — only accidental corruption. The comments say this, but "integrity" in the option name implies security.
- Sync messages include store data. There's a `maxPayloadBytes` guard but no authentication. Any tab can broadcast arbitrary data to any store.
- `hydrateStores` from server-rendered snapshots accepts `Record<string, unknown>` without any origin validation. XSS-injected HTML could include a poisoned `__STROID_STATE__` script tag.

---

### 10. Efficiency — Score: 7/10

**Strengths:**
- `deepClone` prefers `structuredClone` (native, fast) with fallback to manual recursive clone.
- Snapshot caching avoids re-cloning for repeated reads at the same `updateCount`.
- `shallowClone` and `"ref"` snapshot modes allow opt-out of deep cloning for performance-critical paths.
- Subscriber `Set` allows O(1) subscription/unsubscription.
- Computed recomputation is lazy (only on dep change, skipped if `Object.is` matches).

**Weaknesses:**
- Deep clone on every `getStore` call (for objects) even when the store hasn't changed. If a component calls `getStore` in a render with no write in between, it still clones. The snapshot cache only avoids this in the React hook path, not in direct `getStore()` calls.
- `setStore` with a mutator always deep-clones the entire state before applying the mutation. There is no structural sharing. Writing one field of a 200-field object clones all 200 fields.
- `buildPendingOrder()` in the flush logic creates multiple new arrays (`pendingBuffer`, `orderedNames`, `names`) on every flush tick. These are reused module-level arrays (`orderedNames.length = 0`), which is good, but `names = orderedNames.slice()` still creates a new copy each time.
- `getTopoOrderedComputeds` uses `ready.splice(insertAt, 0, child)` for sorted insertion — O(n) splice on each node. A sorted set or heap would be more efficient.

---

### 11. Observability — Score: 8/10

**Strengths:**
- `getMetrics(name)` returns per-store notification timing (`notifyCount`, `totalNotifyMs`, `lastNotifyMs`).
- `runtime-tools` exposes `getSubscriberCount`, `getAsyncInflightCount`, `getPersistQueueDepth`, `getComputedGraph`, `getComputedDeps`.
- `configureStroid({ logSink: { warn, error, critical } })` allows custom log routing (structured logging, Sentry, etc).
- DevTools integration via a dedicated feature (`stroid/devtools`).
- History tracking (`historyLimit`, `getHistory`) for time-travel debugging.

**Weaknesses:**
- No built-in performance tracing (no marks/measures for Web Performance API).
- `getMetrics` only tracks notification time. There's no tracking of write time, validation time, or middleware time.
- No OpenTelemetry integration or structured trace export.
- The `logSink.critical` function exists but is not consistently used across all error paths. Some errors still go directly to `console.error` in edge cases.

---

### 12. Well-Integrated — Score: 7/10

**Strengths:**
- `queryIntegrations` subpath for TanStack Query integration.
- Schema validation duck-types Zod, Yup, Joi without requiring any as a dependency.
- React hooks use `useSyncExternalStore` (React 18+) — correct concurrent mode behavior.
- `configureStroid` allows log routing to any logging backend.

**Weaknesses:**
- No official React Native support documentation.
- No Svelte, Vue, or Solid adapters.
- The `stroid/testing` subpath requires `_hardResetAllStoresForTest` which is not ergonomic. Each test must remember to call `clearAllStores()` or the registry bleeds between tests.
- `fetchStore` is NOT a replacement for TanStack Query — it lacks query invalidation, infinite queries, and optimistic updates. The `queryIntegrations` file is a stub.

---

### 13. Goal-Oriented Design — Score: 8/10

**Strengths:**
- Every major design decision traces to a stated goal: no Provider, tree-shakeable features, SSR-safe by default.
- The `STATUS.MD` commit cheat sheet is an unusual but genuine attempt to keep commits semantically meaningful.
- The version number honestly reflects maturity (0.0.5, not a false 1.0).

**Weaknesses:**
- The goal of "zero runtime dependencies" is correct. But the goal of "named global stores" creates a tension with TypeScript: string-named stores require either ambient declarations or `store()` handles for type safety. This is never fully resolved — it's an inherent tension acknowledged in the docs but not solved.

---

### 14. Feedback Loops — Score: 6/10

**Strengths:**
- Dev-mode warnings on broad `useStore` subscriptions.
- Warning when `fetchStore` auto-creates a store (potential typo).
- `assertRuntime` mode turns warnings into errors for test environments.
- `WriteResult` return type gives immediate feedback on failed writes.

**Weaknesses:**
- Silent persist failure in production is a broken feedback loop.
- Missing feature imports produce a dev-only warning that many developers will miss.
- No runtime warning when a subscriber's selector is recreated every render (causing infinite re-subscription).
- No warning when a mutator takes an unusually long time (potential blocking main thread).

---

### 15. Documentation — Score: 7/10

**Strengths:**
- `CHANGELOG.md` is detailed and honest — it lists breaking changes, bug fixes, and test coverage additions.
- Module headers with `LAYER`, `OWNS`, and `DOES NOT KNOW` comments are excellent internal documentation.
- `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` exist.
- README is accurate (rare) and covers footguns honestly.

**Weaknesses:**
- No API reference docs generated from types (no TypeDoc or equivalent).
- `replaceStore` is exported but undocumented in the README.
- The `stroid-website` docs are a Next.js app but not deployed in a way that's referenced from the README (no live URL).
- Migration guide between 0.0.4 and 0.0.5 is buried in CHANGELOG, not a dedicated migration doc.
- `namespace()` helper is mentioned in one sentence with no example of its full API.

---

### 16. Fail Gracefully — Score: 8/10

**Strengths:**
- `createStore` returns `undefined` without throwing. Callers can null-check.
- `setStore` returns `WriteResult` without throwing. Reason codes are actionable.
- Subscriber errors are caught and warned — one subscriber throwing does not kill others.
- Middleware throws are caught and treated as aborts.
- Persist driver errors are caught and routed to `onError`.
- `fetchStore` timeout (60s) prevents hanging requests from hanging forever.

**Weaknesses:**
- `setStoreBatch` THROWS on errors — it's the one API that breaks the no-throw convention. This is documented but breaks consistency.
- `_throwAsyncUsageError` (inflight slot exceeded) throws in production — this is a hard crash for a state management library. Should return `null` / error state, not throw.
- `replaceStore` inside `setStoreBatch` throws a warning but does not throw — inconsistent with the throw behavior of other disallowed operations.

---

### 17. Honesty of Abstractions — Score: 7/10

**Strengths:**
- `snapshot: "ref"` honestly tells you "you get the live reference." No false safety guarantees.
- `persist.checksum: "none"` honestly tells you integrity checking is disabled.
- `allowSSRGlobalStore` forces opt-in for known-unsafe behavior.

**Weaknesses:**
- `fetchStore` is marketed as an "async caching layer" but it secretly owns and manages your store's shape. If you call `fetchStore("user", url)`, your store is now shaped as `{ data, loading, error, status }` regardless of what you initialized it with. This is a hidden contract.
- `createComputed` deps are `string[]` — at runtime, a misspelled dep silently computes against `null`. No warning that a dep store doesn't exist.
- The `snapshot: "shallow"` mode description says "only clones the top level; nested objects are shared" — which means mutations of nested objects in one component can silently affect another component's snapshot. The docs mention this as a "note" but it's a correctness hazard.

---

## PHASE 3 — TYPE SYSTEM & DEVELOPER EXPERIENCE

### Score: 7/10

**Strong Type Inference:**
- `setStore(storeDef, "profile.name", value)` infers `value` type from the path. `Path<State>` and `PathValue<State, Path>` with depth-10 recursion is impressive engineering.
- `useStore(handle, path)` returns `PathValue<State, Path> | null` — the null reflects reality (store may not exist).
- `StoreDefinition<Name, State>` and `StoreKey<Name, State>` handles carry type information across the API boundary.

**Weaknesses:**
- `createComputed(name, deps, computeFn)` is fully `unknown`-typed. The `compute` function receives `...args: unknown[]` and returns `unknown`. There is zero type safety at the computed boundary. This is the biggest type system failure in the codebase.
- `hydrateStores(snapshot)` accepts `Partial<{ [K in StoreName]: StateFor<K> }>` but `StoreName` is `string` in ambient mode — so you get `Partial<{ [key: string]: unknown }>` which is useless.
- `StrictStoreMap` solves the above but requires manual ambient declaration merging — too much ceremony for most users.
- The `useRegistry` / `bindRegistry` SSR API is stringly-typed: `useRegistry("my-scope")` gives no indication of what stores exist in that scope.
- Overload count on `setStore` is 9 overloads. This is necessary but produces confusing error messages when you pass wrong arguments — TypeScript picks the wrong overload and gives a misleading error.

**Hidden Footguns:**
- `setStore(name, partialObject)` silently does a **shallow merge** for object stores. A developer expecting deep merge will silently overwrite nested objects. TypeScript cannot catch this.
- `createStore` returning `undefined` means that `const user = createStore("user", {...}); setStore(user!, "name", "Ava")` — the `!` is a lie waiting to happen.
- Inline selectors in `useStore` (`useStore("name", state => state.count)`) cause a new function reference on every render. The hook's `useCallback` on `subscribe` only captures `storeName` and `hasSelector`, but the selector function reference changes, causing the `subscribeWithSelector` logic to re-subscribe on every render. This is a **subtle re-render loop footgun** for users who don't know to stabilize their selectors with `useCallback` or module-level declarations.

---

## PHASE 4 — ARCHITECTURAL INTEGRITY

### Architectural Consistency: Strong

The layered dependency direction is consistently enforced:
```
index.ts → store-write/read/notify → store-lifecycle → store-registry
```
No upward dependency violations found. Feature plugins do not import from hooks. Hooks do not import from features.

### Separation of Concerns: Mostly Good

The `store-lifecycle/` subdirectory split (registry, validation, hooks, identity, bind, types) is correct decomposition. The `features/persist/` split (crypto, load, save, watch, types) shows the same discipline.

**Violations found:**
- `async-fetch.ts` (708 lines) mixes: rate limiting, deduplication, caching, retry, timeout, abort, response parsing, and store state management. This should be 5 files.
- `utils.ts` (702 lines) is architecturally incoherent — hashing utilities have no business living next to path traversal utilities.

### Dependency Direction: Correct

The proxy pattern in `store-lifecycle/registry.ts` is the architectural masterstroke that enables SSR scope isolation. The `Proxy` objects (`createRegistryObjectProxy`, `createRegistryMapProxy`) intercept all property access and route to `getActiveRegistry()`. This means the same exported `stores`, `meta`, `subscribers` references work transparently across registry scope switches.

**Risk:** Proxy-based architecture is invisible to performance profilers. Every property access on `stores` is a Proxy trap. In hot paths (notify flush with 100+ stores), this adds measurable overhead. No benchmarks compare proxy vs direct access.

### Modular Boundaries: Mostly Respected

**Anti-patterns found:**
1. **`store.ts` as a re-export aggregator** — `store.ts` re-exports from `store-write.ts`, `store-read.ts`, `store-notify.ts`, and `store-lifecycle.ts`. It's a barrel file pretending to be a module. This creates import cycle risk.
2. **`computed.ts` touching all layers** — imports from `store-write`, `store-read`, `store-notify`, `store-lifecycle`, `computed-graph`, `utils`. It has no layer of its own.
3. **Feature activation via side effects** — the architecture requires users to import `"stroid/persist"` to activate persistence. This is a correct tree-shaking pattern but it creates a category of "feature present in code but not registered" that produces subtle bugs.

### Is the Architecture Stable Long-Term?

**Yes, with caveats.** The registry proxy pattern, layered separation, and feature plugin system provide a solid foundation. The main risks are:
1. The computed system is bolted on and not deeply integrated (string-typed deps, no type inference)
2. The async layer (`fetchStore`) imposes an implicit store shape that conflicts with user-defined store shapes
3. The API surface is still changing (mergeStore removed in 0.0.5, replaceStore undocumented but present) — v1 API stability is not yet declared

---

## PHASE 5 — PRACTICAL FUNCTIONALITY

### Runtime Validation: Good

Schema validation supports Zod/Yup/Joi/custom. Executed on every `setStore` and `createStore`. Type mismatches in path writes are caught and blocked. Prototype pollution is prevented at multiple layers.

**Gap:** Schema validation on persist load only applies to the outer envelope, not the migrated state in some paths (`{ requiresValidation: false }` is returned for fallback-to-initial which skips revalidation).

### Edge Case Handling: Good

The regression test file covers: chunked flush ordering, validator side-effect counts, subscribeWithSelector first-notification behavior, lazy hydration, transaction scope isolation, stale path cache bypass. These are non-obvious edge cases and they're tested.

**Missing:** What happens when `structuredClone` throws on a WeakRef or Proxy object? The fallback `_deepCloneFallback` handles most cases but `WeakRef` traversal is not guarded. Silent failure possible.

### Error Boundaries: Adequate

`setStoreBatch` throws. Everything else returns error results. This inconsistency is the primary error boundary issue.

### Backward Compatibility: Fragile

Version 0.0.5 removed `mergeStore` and `chain`. The CHANGELOG records this as a breaking change. There's no deprecation period — functions are removed without a migration path. For a v0.x library this is acceptable. For production adoption, it's a risk: **upgrading stroid could break your app**.

### Migration Strategy: None

No codemods. No deprecation warnings before removal. No `@deprecated` JSDoc annotations. When `mergeStore` was removed, there was no `@deprecated` warning in 0.0.4 to warn users.

### Code Churn Rate: High

The CHANGELOG for unreleased 0.0.5 lists 30+ changes including breaking API removals, new features, and architectural changes. This is active, high-churn development. The commit rate and PR template both suggest rapid iteration.

**Maintenance Risk: Medium-High** for adopters today. The API will change again before v1.

---

## PHASE 6 — COMMUNITY HEALTH

**Bus Factor: 1** — The GitHub URL points to `Himesh-Bhattarai/stroid`. Single author. Zero contributors listed. No `CODEOWNERS` file. If the author walks away, the library is abandoned.

**Contributor Friendliness: Moderate**
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `pull_request_template.md` exist — these are positive signals.
- Issue templates (bug_report, feature_request, status) are thoughtful.
- The `STATUS.MD` commit convention is unique and slightly idiosyncratic — it may confuse contributors.

**Project Sustainability: Unknown**
- No funding model mentioned. No sponsorship buttons. No company backing.
- The website (`stroid-website/`) exists but the live URL is not in the README.
- npm downloads unknown (v0.0.5 not yet published to npm at audit time).

**Community Health: Pre-community.** There is no community yet. This is a solo project looking for early adopters. That's honest given the version number.

---

## PHASE 7 — INTEGRATION & ECOSYSTEM

**DevTools Support: Partial**
- `stroid/devtools` feature exists. DevTools API is defined. No official browser extension shipped.
- History tracking (`getHistory`/`clearHistory`) enables time-travel debugging.

**Framework Compatibility:**
- React 18+ (via `useSyncExternalStore`) — **correct**.
- No Next.js App Router example despite the SSR-first `createStoreForRequest` API.
- No React Native guidance.
- No Vue, Svelte, Solid adapters.
- SSR isolation works with Node.js `async_hooks` — untested on edge runtimes (Cloudflare Workers, Deno Deploy) where `AsyncLocalStorage` behavior differs.

**Integration Simplicity: Good for React, Poor for Others**

The zero-Provider, named-store API is simpler than Redux for React. More complex than Zustand for simple cases. Easier than Jotai for non-atom thinking.

**Plugin/Extension Potential: Good**
- The feature registry (`registerStoreFeature`) is a real plugin system.
- Feature lifecycle hooks (create/write/delete) are expressive enough for most integrations.

**Ecosystem Readiness: Not Ready**
- No official DevTools extension.
- No ecosystem of community plugins.
- No migration tools from Zustand/Redux.
- TanStack Query integration is a stub.

---

## PHASE 8 — FAILURE ANALYSIS: TOP 10 PRODUCTION ISSUES

### #1 — Silent Feature Deactivation (CRITICAL)
**What:** `import "stroid/persist"` is required to activate persistence. Forgetting it means persist silently does nothing.
**Production Impact:** User data is never saved. App appears to work in development (if the import exists in dev entry point but not prod), fails silently in production.
**Fix:** Emit a `console.error` (not just warn) in production when a persist config is present but the feature isn't registered.

### #2 — fetchStore Owns Your Store Shape (HIGH)
**What:** Calling `fetchStore("user", url)` on an existing `createStore("user", { name: "", age: 0 })` will overwrite the store shape with `{ data, loading, error, status }`.
**Production Impact:** Components reading `getStore("user").name` get `undefined`. TypeScript does not catch this because `setStore` accepts partial data.
**Fix:** `fetchStore` should require an explicitly async-typed store. Document this as a hard requirement with a lint rule.

### #3 — Inline Selector Re-subscription Loop (HIGH)
**What:** `useStore("user", state => state.profile)` — if `state => state.profile` is an inline arrow function, it creates a new function reference on every render. The `subscribe` callback recreates via `subscribeWithSelector`. In React StrictMode (double-render), this causes measurable churn.
**Production Impact:** Performance degradation in components with complex inline selectors. Not a crash, but causes extra re-renders.
**Fix:** Document requirement to stabilize selectors with `useCallback` or module-level functions. Add a dev-mode warning when selector reference changes more than once per 100ms.

### #4 — setStoreBatch Throws, Violating Library Contract (HIGH)
**What:** Every other write API returns a `WriteResult`. `setStoreBatch` throws. In async code that awaits before calling `setStoreBatch`, errors bubble up uncaught if the await site has no try/catch.
**Production Impact:** Unhandled promise rejections in production. App crashes.
**Fix:** Add a `try/catch` around all `setStoreBatch` call sites in your codebase, or change `setStoreBatch` to return an error result (breaking change).

### #5 — Concurrent SSR Request Scope Leakage on Edge Runtimes (HIGH)
**What:** SSR registry isolation uses `AsyncLocalStorage`. On Cloudflare Workers and some edge runtimes, `AsyncLocalStorage` behavior differs from Node.js. The `createStoreForRequest` API may not correctly isolate registry scopes.
**Production Impact:** Cross-request data leakage. User A sees User B's data.
**Fix:** Test explicitly on Cloudflare Workers. Add documentation of supported runtimes.

### #6 — Memory Leak: Async Rate Limiter Keys Under High Traffic (MEDIUM)
**What:** `rateWindowStart[cacheSlot]` and `rateCount[cacheSlot]` are keyed by `name:cacheKey`. For dynamic `cacheKey` values (e.g., user IDs), this creates unbounded key growth. `_pruneRateCounters` only runs when a new request comes in — if traffic stops, leaked keys remain.
**Production Impact:** Memory growth proportional to unique `cacheKey` values used. In a multi-tenant app with 100,000 unique user IDs as cache keys, this leaks.
**Fix:** Run `_pruneRateCounters` on a periodic timer, not only on new requests.

### #7 — Computed Store Type Erasure with Misspelled Deps (MEDIUM)
**What:** `createComputed("total", ["prodcuts", "tax"], (products, tax) => ...)` — typo "prodcuts" instead of "products". `getStore(store("prodcuts"))` returns `null`. The compute function receives `null` without warning.
**Production Impact:** Computed stores silently compute wrong values. The miscomputed value is stored and propagated to subscribers.
**Fix:** Warn in `createComputed` when any dep in `deps[]` doesn't exist as a store at registration time.

### #8 — Deep Clone Failure on Non-Serializable State (MEDIUM)
**What:** `structuredClone` throws on `WeakRef`, `Proxy`, `EventTarget`, and other non-cloneable objects. The fallback `_deepCloneFallback` is called — but it does not handle `WeakRef` and `Proxy` objects. It will silently produce an incorrect clone or throw.
**Production Impact:** If a developer accidentally stores a non-serializable object, `setStore` succeeds (sanitize doesn't catch all non-serializable types), but reads and notifications may corrupt state.
**Fix:** `sanitizeValue` should explicitly block non-serializable types: `WeakRef`, `Proxy`, `EventTarget`, `ReadableStream`, etc.

### #9 — BroadcastChannel Sync Without Authentication (MEDIUM)
**What:** Any tab can broadcast a valid sync message to any store. There's no authentication token. A malicious browser extension or XSS can write arbitrary store values via `BroadcastChannel`.
**Production Impact:** State poisoning. An attacker controlling one browser tab can write arbitrary values to all stores with sync enabled.
**Fix:** Add an optional `authToken` to sync config. Reject messages with non-matching tokens.

### #10 — Path Validation Cache Not Cleared on Lazy Store Materialization (LOW-MEDIUM)
**What:** `clearPathValidationCache()` clears on `invalidatePathCache(name)`. But lazy stores materialize on first access (`materializeInitial`), and the initial call to `materializeInitial` does not always call `invalidatePathCache`. A cached negative path validation from before materialization could persist.
**Production Impact:** Rare. Path writes to lazy stores that were cached as invalid before materialization could return `{ ok: false, reason: "path" }` even when the path is valid.
**Fix:** Call `invalidatePathCache(name)` explicitly during lazy store materialization.

---

## PHASE 9 — DESIGN COMPARISON

### vs. Zustand

| Dimension | Zustand | Stroid |
|---|---|---|
| Store access | Module import (closure) | String name (global registry) |
| Provider | Not required | Not required |
| Type safety | Excellent (closure types flow naturally) | Good (requires handles or StrictStoreMap) |
| Computed | Via selector | First-class `createComputed` |
| Persist | `zustand/middleware/persist` | Built-in with migrations |
| Async | None built-in | `fetchStore` with cache/retry |
| Sync | None | BroadcastChannel built-in |
| SSR | Manual | First-class `createStoreForRequest` |
| Bundle size | ~2KB | ~8-15KB (depends on features) |

**Stroid is better at:** SSR isolation, cross-tab sync, built-in async with deduplication, computed stores.
**Stroid is weaker at:** Type safety for string-named stores, ecosystem maturity, bundle size.

### vs. Jotai

Jotai uses atoms (imported references) vs. Stroid's string-named stores. Jotai has better TypeScript inference because atoms are typed at creation. Stroid's `StoreDefinition` handle is analogous to Jotai's atom, but it's optional — most users will use strings and lose type safety.

**Stroid reinvents:** Jotai's computed atoms → Stroid's `createComputed`. Jotai's `atomFamily` → Stroid's dynamic store creation by name. But Jotai's approach is architecturally cleaner for TypeScript.

### vs. Redux Toolkit

RTK is feature-complete and battle-tested. Stroid is simpler API but missing: optimistic updates, normalized cache, entity adapters (partially covered by `createEntityStore` helper), RTK Query, time-travel with Redux DevTools (Stroid has history but no Redux DevTools extension).

**Stroid wins on:** API simplicity, setup time, SSR ergonomics, no Provider requirement.
**Stroid loses on:** Ecosystem, DevTools maturity, team/enterprise support.

---

## PHASE 10 (PHASE 11 in prompt) — BUG HUNT MODE

### BUG-01 — Race Condition in Chunked Flush (`store-notify.ts`)
**Location:** `store-notify.ts`, `runQueue` function, `processNext()` recursive scheduler
**What:** When `chunkDelayMs > 0`, subscribers are called across multiple `setTimeout` callbacks. Between two chunks, a new write can occur to the same store. The code checks `currentVersion !== task.version` and re-queues, but **the task's `subsArray` was captured before the new version** — it's a snapshot of the subscriber set at flush start. New subscribers added mid-flush are not notified.
**How it breaks production:** In a chunked flush with 1000 subscribers, a component mounts mid-flush (adds a subscriber), doesn't receive the current notification. It renders stale state until the next write.
**Fix:** Re-snapshot `Array.from(subs)` at the start of each chunk, not once at task creation.

### BUG-02 — Stale `cachedData` Closure in `fetchStore` Background Revalidate (`async-fetch.ts`)
**Location:** `async-fetch.ts`, ~line 220 (`cachedData = cacheMeta[cacheSlot].data`)
**What:** `cachedData` is captured in the closure when the function starts. If a different fetch updates `cacheMeta[cacheSlot].data` between the start of background revalidation and the error handler, the error path sets `data: backgroundRevalidate ? cachedData : null` — using the **old** `cachedData`, not the current cache.
**How it breaks production:** During background revalidation, if an error occurs, the store is updated with stale cached data instead of the actual current cache. Components briefly show older data.
**Fix:** Read `cacheMeta[cacheSlot]?.data` at error time, not at function start.

### BUG-03 — `orderedNames` Module-Level Array Mutation During Async Flush (`store-notify.ts`)
**Location:** `store-notify.ts`, module-level `orderedNames: string[]`
**What:** `orderedNames` is a module-level mutable array. `buildPendingOrder()` calls `orderedNames.length = 0` then pushes to it, then returns `names = orderedNames.slice()`. If two microtask flushes somehow overlap (impossible in single-threaded JS but possible in test environments with fake timers or across realm boundaries), `orderedNames` state is shared and corrupt.
**How it breaks production:** Low risk in browser. In test environments with fake timers that synchronously advance, this can produce non-deterministic notification order.
**Fix:** Use a local array in `buildPendingOrder` instead of module-level mutation.

### BUG-04 — `metrics` Object Reference Aliasing (`store-notify.ts`)
**Location:** `store-notify.ts`, flush inline path, line ~`metrics = meta[name]?.metrics || { ... }`
**What:** `metrics` is assigned by reference from `meta[name].metrics`. The code then mutates `metrics.notifyCount`, `metrics.totalNotifyMs`, etc. This works correctly. But in the chunked path, `task.metrics` is also a reference to the same object. When the task finishes and the code does `if (meta[task.name]) meta[task.name].metrics = task.metrics`, it's assigning the same reference back to itself — no-op but misleading.
**How it breaks production:** Low risk. Metrics may double-count if `meta[name].metrics` is re-assigned between chunk deliveries.

### BUG-05 — `detectCycle` DFS Visits Nodes Multiple Times (`computed-graph.ts`)
**Location:** `computed-graph.ts`, `detectCycle` function
**What:** The DFS in `detectCycle` resets `visited` and `path` for each `dep` in the outer `for` loop. This means nodes reachable from multiple deps are visited multiple times — O(deps × graph_size) instead of O(graph_size). With 10 deps each reaching 100 nodes, this is 1000 visits instead of 100.
**How it breaks production:** For large computed graphs (20+ computed stores with shared dependencies), `createComputed` becomes noticeably slow. Not a correctness bug, but a performance bug.
**Fix:** Reset `visited` only once before the loop, not inside it.

### BUG-06 — Transaction Pending Callbacks Not Isolated by Registry (`store-transaction.ts`)
**Location:** `store-transaction.ts`, `registerTransactionCommit`
**What:** `registerTransactionCommit` wraps the callback in `runWithRegistry(registry, fn)`. But `endTransaction` calls `state.pending.forEach((fn) => fn())` — and each `fn` already has the registry captured in the `runWithRegistry` closure. This is correct. **But** `endTransaction` itself operates on whatever is the active registry at call time (`getTransactionState(registry)`) — if `registry` is not passed, it uses the global active registry. In concurrent SSR, the active registry may have changed between `beginTransaction` and `endTransaction`.
**How it breaks production:** In concurrent SSR with `createStoreForRequest`, if request A's transaction end is interleaved with request B's registry switch, commits may execute in the wrong scope. The `runWithRegistry` guard protects the commit fns, but `state.pending` cleanup (clearing staged values) runs in whatever registry is active at `endTransaction` time.
**Fix:** Always pass `registry` explicitly to `endTransaction` in `setStoreBatch`.

### BUG-07 — `noSignalWarned` Set is a Leak for Dynamic Store Names (`async-cache.ts`)
**Location:** `async-cache.ts`, `noSignalWarned: Set<string>`
**What:** `noSignalWarned` is a `Set` that grows with each unique store name that triggers the "no AbortSignal" warning. In an app that creates dynamic stores by name (e.g., `fetchStore("user-${userId}", url)` for thousands of users), this set grows unboundedly.
**How it breaks production:** Memory leak proportional to unique dynamic store names that trigger async fetches. In a multi-tenant app, this leaks until page reload.
**Fix:** Use a `WeakMap` with store name symbols, or cap `noSignalWarned` at a fixed size (e.g., 1000 entries) with LRU eviction.

### BUG-08 — `computedDependents` Array Uses `Array.includes` for Dedup (`computed-graph.ts`)
**Location:** `computed-graph.ts`, `registerComputed`, line `if (!dependents[dep].includes(name))`
**What:** `dependents[dep]` is an array. `Array.includes` is O(n). For a dep store with 100 computed stores depending on it, each new `createComputed` call does an O(100) scan.
**How it breaks production:** Performance degradation for large computed graphs. Not a correctness bug.
**Fix:** Change `computedDependents` values to `Set<string>` instead of `string[]`.

### BUG-09 — `isIdentityCrypto` `fn.toString()` Heuristic Breaks with Minification (`features/persist/crypto.ts`)
**Location:** `features/persist/crypto.ts`, `isIdentityCrypto`
**What:** `isIdentityCrypto` checks if a function stringifies to `"v=>v"` or `"(v)=>v"`. After minification, a non-identity function minified to `"v=>v"` would be incorrectly detected as identity. The runtime probe (`fn(probe) === probe`) runs first but can be fooled by a function that returns its input unchanged for the probe string specifically.
**How it breaks production:** A minified encrypt function that accidentally resembles `v=>v` after minification would be flagged as identity crypto, and stroid would warn that encryption is a no-op — incorrect warning, possibly disabling persist.
**Risk:** Low in practice. Severity if triggered: High (disables persistence).

### BUG-10 — `getTopoOrderedComputeds` Returns Empty for Affected Computed with No Affected Deps (`computed-graph.ts`)
**Location:** `computed-graph.ts`, `getTopoOrderedComputeds`
**What:** The function first collects `affected` computed stores. Then it builds `inDegree` only counting deps that are also in `affected`. A computed store that depends on a non-computed (raw) store won't have its dep in `affected`, so `inDegree` is 0, and it goes into `ready`. This is correct for ordering purposes. **BUT**: A computed store that depends on another computed store that is NOT affected (because it depends on a different raw store) will have an incorrect `inDegree` of 0 and be processed before its dependencies, potentially computing stale values.
**How it breaks production:** Computed stores with diamond dependencies (C depends on A and B, B depends on A) may compute using a stale snapshot of B when A changes, because B has `inDegree=0` (A is not in `affected` as a computed) and may be processed after C.
**Fix:** The `affected` set computation needs to trace through both computed AND raw store dependencies more carefully.

---

## PHASE — TESTING & QUALITY ASSURANCE

### Test Structure: 7/10

**Organization:**
- `tests/` root: 17 test files covering core, async, computed, persist, sync, react, SSR, utils, regressions.
- `tests/heavy/`: 5 files for stress/memory/environment tests.
- `tests/types/`: 4 TypeScript type test files.
- No subdirectory structure within `tests/` — flat at 3593 total lines.

The naming convention is consistent: `feature.test.ts` or `feature.core.test.ts`. The separation into `heavy/` is appropriate.

**Missing:** No directory separation between unit, integration, and E2E. The `react-hooks.test.tsx` uses `react-test-renderer` but is labeled the same as pure unit tests. No `__fixtures__` or `__helpers__` directory.

### Test Coverage: 6/10

**Covered well:**
- Core create/set/get/delete/reset flow
- Prototype pollution prevention
- Subscriber notification and unsubscription
- Transaction batching and rollback
- Persist load/save/migration/crypto
- Async fetch deduplication, retry, abort, rate limiting
- Computed store creation and dependency tracking
- React hooks via `react-test-renderer`
- SSR registry isolation
- Type-level tests (public API types, StrictStoreMap)

**Not covered / undertested:**
- `namespace()` helper has no dedicated test
- `createEntityStore`, `createListStore`, `createCounterStore` helpers — no tests found
- `useAsyncStoreSuspense` — mentioned in CHANGELOG as added, tests mentioned but test coverage is thin
- `hooks-form.ts` / `useFormStore` — 0 test lines found in `tests/`
- The `devtools.ts` feature — no tests (requires browser extension)
- `sync.heavy.ts` exists but is marked heavy and not in CI
- Performance regression tests — none
- `replaceStore` — called in computed tests but not directly tested

### Test Quality: 7/10

**Good patterns:**
- Tests use `clearAllStores()` before each test — correct isolation.
- `regressions.test.ts` is an excellent regression file: it documents bug names and the specific condition that was fixed.
- Heavy tests include `stress-memory.heavy.ts` — this is a sign of real-world thinking.
- `deferred()` helper in `async.test.ts` is a well-structured test utility.

**Bad patterns:**
- Multiple tests use `await new Promise(r => setTimeout(r, 0))` (tick-wait) for microtask flush. This is brittle — it depends on implementation detail that notifications are microtask-scheduled. If the scheduling changes, all these tests break.
- `react-hooks.test.tsx` uses `react-test-renderer` which is deprecated in React 19 (devDependencies includes `react-test-renderer@19`). These tests will break on React 19 migration.
- Some tests in `store.core.test.ts` directly access `stores[name]` — coupling to internal implementation details.
- No property-based testing (fast-check, fc) for the path traversal logic.

### Edge Case Testing: 6/10

**Present:** prototype pollution, lazy store edge cases, chunked flush race, path type mismatch, missing store warnings, checksum mismatch on load.

**Missing:**
- What happens when `setStoreBatch` is called from inside a `setStoreBatch`?
- Concurrent `fetchStore` calls with mismatched `transform` functions
- Computed store with 50+ dependencies (performance test)
- `hydrateStores` with `undefined` values in snapshot
- Persist with `driver.setItem` that throws `QuotaExceededError`
- Sync with a closed `BroadcastChannel`
- `createStore` called during an `onCreate` hook (re-entrant)

### Regression Protection: 7/10

`regressions.test.ts` is genuinely valuable — it pins specific bugs with descriptive test names. This is the right approach. 252 lines of targeted regression coverage.

**Risk:** Refactoring `store-notify.ts`'s flush mechanism would break 8+ tests that depend on `setTimeout(r, 0)` tick timing. These tests are protection against regressions but also brittleness anchors.

### Testing Tools: 7/10

- **Framework:** Node.js built-in `node:test` (no Jest, no Vitest) — this is deliberately minimal. Correct choice for a library.
- **React testing:** `react-test-renderer` (deprecated, see above)
- **Type tests:** `tsc -p tsconfig.typetests.json` — proper compile-time type validation
- **No coverage tooling** — `c8` or `v8` coverage is not configured. There is no coverage threshold. This is a gap.
- **CI:** GitHub Actions runs tests and typecheck on push to `main` only — no PR checks. A PR could break tests without blocking merge.

### Final Testing Verdict: 6/10

**Are these tests trustworthy?** Mostly. Core state management behavior is well-covered. Async and sync behavior is tested. React hook behavior is tested.

**Would they catch production regressions?** Yes for core paths. No for: form hooks, entity helpers, devtools integration, edge runtime SSR behavior, computed stores with misspelled deps.

**What critical tests are missing:**
1. `useFormStore` — completely untested
2. `createEntityStore` / `createListStore` / `createCounterStore` — untested
3. Computed store with non-existent dep string (should warn)
4. `fetchStore` overwriting a non-async store shape
5. `setStoreBatch` called re-entrantly
6. Persist behavior across page reload (no E2E/integration test)

**What should be improved immediately:**
1. Replace `react-test-renderer` with `@testing-library/react` before React 19 upgrade
2. Add code coverage measurement with a minimum threshold (80%)
3. Add CI check on PRs, not just pushes to main
4. Write tests for `useFormStore` and entity helpers

---

## PHASE 10 — FINAL VERDICT

### Overall Score: 6.5/10

### Is this production ready?

**No.** Not at v0.0.5. The architecture is production-quality in many dimensions, but the library lacks:
- API stability guarantee (breaking changes occurred at 0.0.3, 0.0.4, 0.0.5 — will occur at 0.0.6+)
- Complete test coverage (form hooks untested, entity helpers untested)
- A stable DevTools extension
- Ecosystem support (no official Next.js example, no Cloudflare Workers validation)
- More than one maintainer (bus factor = 1)
- A known production deployment (no case studies)

### Would I adopt this in a serious production system?

**Not today. Watch list for v0.1.0 or v1.0.0.** The architecture is better than most state management libraries I've reviewed at this maturity level. The SSR isolation approach is genuinely clever. The write path defensive programming (WriteResult, sanitizeValue, prototype pollution guards) is correct. But the API will change, the footguns (silent feature deactivation, fetchStore shape hijacking, inline selector loops) are not yet resolved, and bus factor 1 is disqualifying for production risk.

### Biggest Risks

1. **Silent feature deactivation** — persist/sync silently disabled in production if side-effect import is forgotten
2. **API instability** — 3 releases have included breaking changes; v1 API is not declared
3. **Bus factor = 1** — no organizational backing, no co-maintainers
4. **fetchStore store shape contract** — undocumented, easy to violate, silent corruption

### Strongest Ideas

1. **Proxy-backed registry scope switching for SSR** — architecturally elegant, correctly solves per-request isolation without changing the call-site API
2. **WriteResult return type** — consistent error handling without throws (except setStoreBatch, fix that)
3. **Feature plugin system** — correct pattern for tree-shakeable optional features
4. **Lamport clock + BroadcastChannel sync** — surprisingly sophisticated for a v0.0.5 library
5. **Path type inference to depth 10** — the `Path<T, Depth>` recursive type is genuinely impressive and useful

---

## 3 BRUTAL TRUTHS

**Truth 1: The side-effect import feature activation system is a product defect, not a design choice.**

The library's single biggest selling point — "install stroid, get persist, sync, and devtools" — is undermined by requiring users to import side-effect modules that are invisible to TypeScript and produce no compile-time error when forgotten. A user who forgets `import "stroid/persist"` gets a working app that silently loses all user data. This is not a developer education problem. It's a library design problem. The tree-shaking benefit does not justify the production data loss risk.

**Truth 2: v0.0.5 is a polished prototype, not a v0.5 library.**

The version number `0.0.5` is honest. But the code reads like a developer who has solved state management 3 or 4 times before and is executing on a well-thought-out design. The architecture debt is not accumulated confusion — it's tactical compromises made deliberately. The computed system is incomplete by design (strings instead of typed handles). The async system is ambitious but breaks store shape contracts. These aren't accidents. They're known problems being deferred to a later version. The CHANGELOG's "unreleased" section lists 30+ changes, which means the author knows exactly what's wrong and is fixing it. This is not a vague promise — it's an active engineering sprint.

**Truth 3: The comparison benchmarks are marketing, not engineering evidence.**

The `scripts/compare-state-libraries-output.json` file exists. The `scripts/selector-benchmark-output.json` file exists. Benchmark output files are committed to the repo. But there are no documented methodology notes, no environment specifications, no statistically validated results. Benchmarks without methodology are marketing. They answer "is stroid fast?" with "yes, look at these numbers" without saying "under what conditions, compared to what, measured how many times."

---

## WHY I GENUINELY LIKE THIS PROJECT

Honestly? Three things.

**First: the module header discipline.** Every non-trivial module has `LAYER: ...`, `OWNS: ...`, `DOES NOT KNOW about: ...`. This is rare. Most library code has zero such documentation. The fact that someone cared enough to document what each module is NOT allowed to know means they thought about coupling seriously. This is senior engineering discipline in a v0.0.5 project.

**Second: the CHANGELOG is honest.** It lists what broke, what was removed, and what was fixed with the same level of detail. It doesn't say "performance improvements" — it says "Feature hook context creation now avoids full object spread copies on every write/delete to reduce overhead." That's engineering honesty that most libraries never achieve.

**Third: `createStoreForRequest` and SSR isolation.** This is genuinely hard to get right. Most state management libraries completely ignore SSR scope isolation. Stroid treats it as a first-class feature with a correct implementation (Proxy over AsyncLocalStorage-backed registry). The fact that the same `stores`, `meta`, and `subscribers` variables Just Work in both client and server scopes without any code changes at the call site is impressive engineering.

---

## WHAT STROID NEEDS TO BECOME MY FIRST CHOICE

**1. Fix the silent feature activation footgun.** Make `createStore("user", {}, { persist: {...} })` emit a hard runtime error if `stroid/persist` was not imported. Accept the bundle-size trade-off. Or automatically tree-shake feature imports without requiring manual side-effect imports — use dynamic import lazily triggered on first feature config encounter.

**2. Fix `fetchStore` store shape contract.** `fetchStore` should be a standalone async state slot, not a store write. Or require an explicitly async-typed store: `createAsyncStore("user", ...)`. This separates "async fetch state" from "domain state."

**3. Stabilize the public API and declare v1 semantics.** Publish a written API contract: "these functions are stable and will not change without a major version bump." Add `@deprecated` annotations before removals. Ship a codemod for major API changes.

**4. Add a second maintainer.** Or get organizational backing. No production team will adopt a solo-maintained library for critical state. A company sponsorship, an open-source foundation endorsement, or two active co-maintainers changes this calculus.

**5. Ship an official browser DevTools extension.** The history and metrics are already there. An extension (like Zustand's redux-devtools integration or Recoil's DevTools) turns "has observability" into "has usable observability."

**6. Validate on Cloudflare Workers and Deno.** Edge runtimes are the growth direction for SSR. Explicit compatibility testing and documentation would separate Stroid from state libraries that silently fail on edge.

Do these six things and Stroid becomes a serious contender against Zustand for teams that need: SSR isolation, cross-tab sync, built-in async, and a flat global API. Today it's architecturally ready. It needs polish, stability, and ecosystem to match its ambition.

---

*Audit completed: stroid v0.0.5 — 7788 source lines, 3593 test lines, 17 test files, 93 source files analyzed.*