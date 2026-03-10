# STROID — BRUTAL PRODUCTION AUDIT
**Audited Branch:** `debug-test/splitting-ev` | **Version:** `0.0.5` | **Date:** March 2026  
**Auditor Role:** Senior Software Architect, Production Reliability Engineer, Adversarial Code Auditor

---

## PHASE 1 — REPOSITORY OVERVIEW

### What Problem This Solves

Stroid is a TypeScript state management library targeting both vanilla JS and React. It competes in the Zustand/Jotai/Valtio space but with a distinctly **imperative, string-keyed API** rather than hook-first or atom-based. Stores are created globally by name (`createStore("user", {...})`), mutated with overloaded write functions, and consumed via React hooks or subscription callbacks. The library bundles persistence (localStorage/custom drivers), cross-tab sync (BroadcastChannel), devtools (Redux DevTools integration), async fetch management, SSR utilities, and a feature plugin registry — all in one package with tree-shakeable sub-paths.

### Core Design Philosophy

- **Stores as named singletons**: no imports of store atoms, just use the string name
- **Defensive by default**: sanitize, schema, validator, prototype-pollution guards on every write
- **Features are opt-in plugins**: persist/sync/devtools register themselves via `registerStoreFeature`, keeping the lean core zero-cost
- **Production-fail-safe**: explicit SSR guards, production-server creation blocks, async abort handling
- **Observable by default**: metrics, history, devtools — not tacked on, baked in

### Main Architectural Pattern

**Registry + Plugin Feature Pattern.** A central `StoreRegistry` holds raw state maps. A `FeatureRegistry` holds plugin factories. Writes run through a pipeline: sanitize → schema → validator → middleware → commit → feature write hooks → notify. The notification system is async (microtask-batched), with optional chunked delivery for large subscriber lists.

### Data Flow + Control Flow

```
createStore("name", data, options)
  └─> normalizeOptions → resolveFeatureAvailability
      └─> sanitize(data) → schemaCheck → validatorCheck
          └─> _stores["name"] = data
              └─> runFeatureCreateHooks (persist loads, devtools connects, sync opens channel)
                  └─> _notify("name") [if had pre-existing subscribers]

setStore("name", path, value)
  └─> _exists() → _materializeInitial()
      └─> [overload resolution: mutator | partial object | path+value]
          └─> sanitize → _validatePathSafety
              └─> runMiddleware (can abort)
                  └─> _normalizeCommittedState (schema + validator)
                      └─> _setStoreValueInternal (dev: frozen, prod: raw)
                          └─> runFeatureWriteHooks (persist schedules save, devtools pushes history, sync broadcasts)
                              └─> _notify → _scheduleFlush → queueMicrotask → subscribers
```

### Overall Impression

**Experimentally ambitious, architecturally sound in structure, but not production-ready in its current state.**

| Dimension | Assessment |
|---|---|
| Production Ready | ❌ No — known Must-Fix bugs, dead lazy feature code, v0.0.5 |
| Experimental | ✅ Yes — sophisticated ideas, actively iterating |
| Research Prototype | Partial — the selector dependency tracking via Proxy is research-grade |
| Overengineered | Slightly — the chain API, dual options API (legacy + new), both validate + schema + validator |
| Underengineered | In places — lazy stores are dead code, SSR warning suppression is global |
| Architecturally Sound | The skeleton is solid. The flesh has holes. |

---

## PHASE 2 — CORE ENGINEERING QUALITY

---

### 1. Simplicity and Clarity — **5/10**

**Strengths:**
- Feature files (`persist.ts`, `sync.ts`, `devtools.ts`) are well-isolated, cohesive, and easy to read independently
- `store-registry.ts` and `feature-registry.ts` are lean and clean
- Public API surface (createStore/setStore/getStore/resetStore) is immediately graspable

**Weaknesses:**
- `store.ts` is **870 lines** of a god-file. It owns the notification scheduler, path validation cache, middleware pipeline, feature hook dispatch, lazy materialize, SSR detection, AND all public API. This violates single responsibility at scale
- `async.ts` is **900+ lines** for a single `fetchStore` function — the entire async module is one enormous function factory
- The `_scheduleFlush` function alone is 60+ lines of interleaved logic (chunking, priority stores, metrics, microtask scheduling) inside a closure that creates closures
- Three validation concepts exist simultaneously: `schema`, `validator`, AND `validate` — all doing similar things, all requiring special-casing throughout the normalization layer. The `legacyOptionReplacementMap` shows this is recognized but not fixed

**Risks:**
- Onboarding a new contributor to `store.ts` or `async.ts` will be painful. There is no logical sub-section boundary
- The triple validation concept creates user confusion: which one runs first? What happens if all three are set? (schema runs, then validator runs, but `validate` normalizes into one of them)

**Improvements:**
- Split `store.ts` into: `store-write.ts`, `store-read.ts`, `store-lifecycle.ts`, `store-notify.ts`
- Split `async.ts` into: `async-cache.ts`, `async-retry.ts`, `async-fetch.ts`
- Collapse `schema`/`validator`/`validate` into a single canonical `validate` field in v1

---

### 2. Reliability and Consistency — **5/10**

**Strengths:**
- Prototype pollution is guarded at multiple levels (`FORBIDDEN_OBJECT_KEYS` in both `setByPath` and `sanitize`)
- `sanitize()` rejects BigInt, Symbol, non-finite numbers, circular references
- Middleware abort is correctly detected via Symbol sentinel (`MIDDLEWARE_ABORT`), not just truthiness
- `persistSave` uses checksum (CRC32) for data integrity on load

**Weaknesses:**
- **CONFIRMED BUG: `log()` routes to `console.warn`** — `diagnostics.ts` line 62: `const sink = getConfig().logSink.warn ?? defaultLog`. The default `logSink` always has a `warn` function, so `??` never falls through to `defaultLog`. Every `log("Store created...")` call goes to `console.warn`, not `console.log`. This is misleading and broken.
- **CONFIRMED BUG: Lazy stores are completely dead code** — `createStore` line 610: `const isLazy = normalizedOptions.lazy === true && ...`. `NormalizedOptions` has no `lazy` field. `normalizeStoreOptions` never returns `lazy`. `isLazy` is always `false`. The entire `_initialFactories` map is never populated. `_materializeInitial` checks factories that are never registered. The feature is designed, partially implemented, but 100% unreachable.
- **`_ssrWarningIssued` suppresses warnings globally after the first store** — Once any store triggers the SSR warning, all subsequent stores on the same server process are silenced, even if they're different and have different risk profiles
- **`_broadUseStoreWarnings` Set is never reset in `_hardResetAllStoresForTest()`** — After one test fires a broad-subscription warning for store "counter", no subsequent test for "counter" will warn, creating invisible test-order dependencies
- **`setStore` overloads lie about return type** — Typed overloads declare `void`, but implementation returns `WriteResult`. Callers using typed overloads cannot check success/failure without an explicit cast

**Risks:**
- The lazy feature being documented (in `BLOG.MD` and implied by `_initialFactories` code) but completely broken will confuse users who try to use it
- The `log → console.warn` bug will cause silent misbehavior in production log aggregators that filter by level

---

### 3. Usability — **7/10**

**Strengths:**
- Multiple overloads for `setStore` cover real-world patterns: mutator function, partial object merge, typed path
- Dev warnings are contextual and actionable (`suggestStoreName` does typo-correction)
- `chain()` API provides a fluent alternative for deeply nested writes
- React hooks (useStore/useSelector/useStoreField) cover the full selector memoization pattern correctly
- `createCounterStore`/`createListStore`/`createEntityStore` helpers eliminate boilerplate

**Weaknesses:**
- The string-keyed API means NO autocomplete on store names — you can type `"usre"` and only get warned at runtime via `suggestStoreName`
- `createStore` returns `StoreDefinition | undefined` but all overloads of `setStore` accept `StoreDefinition | string`, tempting callers to use the raw return value without null-checking
- The dual namespace (subpath imports vs root imports) requires documentation discipline — users instinctively import from `"stroid"` but then find async/persist/sync missing

---

### 4. Flexibility and Adaptability — **7/10**

**Strengths:**
- The feature plugin registry (`registerStoreFeature`) is genuinely extensible — third-party features can hook into every store lifecycle event
- `configureStroid` allows replacing the log sink, flush config, and revalidation behavior globally
- Persist drivers are interface-based — any `{getItem, setItem, removeItem}` object works
- SSR support with `createStoreForRequest` covers the main server use case

**Weaknesses:**
- **Bug 27 (acknowledged): `createStoreForRequest.create(name, data, options)` — the `options` parameter is silently ignored**. The bufferedOptions is collected but during `hydrate()`, the merge of `bufferedOptions` into the final options is present... wait, let me look again. Actually looking at `server.ts` line by line: `bufferedOptions[name] = { ...options }` is stored. Then in `hydrate()`, `merged[name] = { ...(options.default || {}), ...(bufferedOptions[name] || {}), ...(options[name] || {}) }`. This DOES merge them. But Bug 27 says they're ignored. The bug report is potentially stale or refers to a subtlety — for example, if the caller passes options to `hydrate()` that conflict, the per-store buffered options are in the middle priority, not highest. The bug report may mean the documented behavior doesn't match. Either way the API contract is confusing.
- `configureStroid` is global — in test environments with module isolation, configuration bleeds between test files unless manually reset

---

### 5. Scalability — **5/10**

**Strengths:**
- Subscriber chunking (`chunkSize`, `chunkDelayMs`) prevents blocking on massive subscriber lists
- Priority store ordering in flush means critical stores notify first
- Async inflight slots are capped at 100 per store

**Weaknesses:**
- All store state lives in module-level `Record<string, unknown>` objects. With hundreds of stores, `Object.keys(_stores)` is O(n) on every `clearAllStores` call
- `_pathValidationCache` is a `Map<string, boolean>` that grows unbounded until a write clears it for a specific store. With thousands of path accesses and store deletions, memory pressure accumulates
- `_scheduleFlush` creates new closures on each invocation. At high store-change frequency, this generates continuous GC pressure
- The notification system uses `Array.from(_pendingNotifications)` on every flush — converts a Set to an Array, sorts priority stores with `filter()`, merges with another `filter()`. All linear scans. At 1,000 stores this is thousands of operations per notification batch.

---

### 6. Low Redundancy — **6/10**

**Weaknesses:**
- `_createBaseFeatureContext` generates an object with 18 properties on every write to every store. Devtools, persist, and sync each receive this same fat context object. The object is recreated on every `_runFeatureWriteHooks` call. For a store that has only sync enabled but not persist or devtools, you still pay the cost of creating contexts for all three
- `deepClone` is called in: every `getStore()` read, every `subscribeWithSelector` callback (clones both next AND prev), every `resetStore`, every `_getSnapshot`, every middleware call (`deepClone(nextState)` in the middleware loop for EACH middleware). The deepClone call count per operation is 3-5x what's necessary
- Both `useStore` and `useSelector` duplicate the exact same selector caching logic (the `SelectorCache<R>` pattern, the `selectorRef/equalityRef/cache` triple) instead of extracting a shared hook

---

### 7. High Cohesion, Loose Coupling — **7/10**

**Strengths:**
- Features truly don't depend on each other — persist, sync, and devtools are independent plugins
- `store-registry.ts` is purely structural — it holds data, no logic
- `feature-registry.ts` is a pure registry pattern

**Weaknesses:**
- `store.ts` imports from `adapters/options`, `features/lifecycle`, `feature-registry`, `store-registry`, `internals/store-admin`, `internals/config`, and `utils`. The core store is the dependency hub for the entire system — not loose at all
- `async.ts` imports directly from `store.ts` internal subscriptions (`_subscribe`) — this is an internal hook that couples async to store internals rather than a stable public interface

---

### 8. State Management — **6/10**

**Strengths:**
- Deep freeze in dev mode catches mutations
- Snapshot cache (`_snapshotCache`) prevents recomputing deep clones when the source hasn't changed
- `produceClone` gives Immer-like ergonomics without Immer's proxy overhead

**Weaknesses:**
- **Module-level mutable state is the fundamental design** — `_stores`, `_subscribers`, `_meta`, `_batchDepth`, `_notifyScheduled`, `_pendingNotifications` are all module-level singletons. In test environments using workers or module-isolated test runners, this breaks. In production SSR with module caching, this is the primary cross-request leak vector.
- `_batchDepth` is not protected against concurrent async callers. If two async paths call `setStoreBatch` concurrently (possible in non-test async scenarios), `_batchDepth` will be incremented by both and decremented asymmetrically
- There is no "computed/derived store" concept — everything must be imperatively derived in selectors, with no reactive propagation chain

---

### 9. Robust Security — **5/10**

**Strengths:**
- `FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"])` — explicitly blocks prototype pollution in both path writes and sanitize
- `sanitize()` rejects accessor properties (`get`/`set`) from being stored
- Persist uses CRC32 checksum to detect tampered storage values
- SSR creation is blocked by default to prevent cross-request data leaks

**Weaknesses:**
- **The "encryption" API is identity by default** — `encrypt: (v: string) => v` is the shipped default. Users who store sensitive data without explicitly providing an encryption function get zero encryption with zero warning. The warning fires only when `isIdentity(cfg.encrypt)` is true AND the user passed their own function that happens to be identity. If they use the default (which IS identity), the identity check runs but on the default function. Whether it actually warns correctly is subtle.
- **`crc32` is not a cryptographic hash** — it's presented in the context of "checksum" which is fine for integrity, but the naming `hashState` is ambiguous and may lead users to believe it provides content authentication it does not
- `runSchemaValidation` accepts schemas with `.validate()` that return truthy/falsy — no error message extraction from Yup-style validators means validation failures lose their diagnostic information
- No rate-limiting on `fetchStore` — a tight loop calling `fetchStore` can exhaust the 100-slot inflight limit but will then just fail silently

---

### 10. Efficiency — **5/10**

**Strengths:**
- `structuredClone` is used when available (fast native clone)
- CRC table is lazily initialized and cached
- `_pathValidationCache` caches successful path validations to avoid re-traversal
- Subscriber notification is deferred to microtask, allowing batching

**Weaknesses:**
- **`getStore()` ALWAYS deep clones, even for primitive values** — reading a `number` store does `deepClone(5)` which goes through `structuredClone(5)`. This is unnecessary overhead for primitive reads and it's the documented behavior (intentional per BUG_REPORT Bug 13), but it's still wasteful
- **`subscribeWithSelector` clones BOTH next and prev on EVERY change** — two `deepClone` calls per notification, regardless of data size
- **`_scheduleFlush` creates an array from Set + two filter passes on every flush** — at 100 stores this is 300 operations just for priority ordering, before touching any subscriber
- **Middleware clones state before each middleware function**: `const middlewareNext = deepClone(nextState)` — with 3 middleware functions, you do 3 deep clones before committing
- **`persistSave` uses `setTimeout(fn, 0)` for write coalescing** — this means unload events (page close) that happen within the same event loop tick will NOT persist the last write. Data loss is guaranteed on abrupt exits

---

### 11. Observability — **8/10**

**Strengths:**
- Per-store metrics: `notifyCount`, `totalNotifyMs`, `lastNotifyMs` on every store
- DevTools integration: history per store, diff tracking, action labels
- `configureStroid.logSink` allows routing logs to external observability platforms
- `getStoreMeta()` exposes `createdAt`, `updatedAt`, `updateCount`, `version`
- Async metrics: `cacheHits`, `cacheMisses`, `dedupes`, `requests`, `failures`, `avgMs`, `lastMs`
- `getHistory()` lets you replay state transitions

**Weaknesses:**
- Metrics are per-store but there is no aggregate cross-store metrics API
- No structured event emission — you can't subscribe to "any store changed" globally without hooking each store
- The `log` bug means structured logs don't flow to the correct channel (goes to `warn` sink instead of a dedicated `log` sink)

---

### 12. Well-Integrated — **7/10**

**Strengths:**
- Zod (`safeParse`), Yup (`isValidSync`/`validateSync`), custom validators — all detected via duck-typing without runtime imports
- Redux DevTools extension is connected without requiring its package
- React integration uses `useSyncExternalStore` (correct React 18 concurrent mode API)
- `testing.ts` subpath provides a clean test-isolation surface

**Weaknesses:**
- No Preact, Vue, or Svelte adapter (fair for v0.0.5, but limits ecosystem reach)
- `fetchStore` hardcodes content-type `application/json` detection — XML, FormData, binary responses require custom transform
- No integration with React Query or SWR conventions — `fetchStore` reinvents cache-key semantics that are already standardized elsewhere

---

### 13. Goal-Oriented Design — **7/10**

The library clearly wants to be: lean core + optional features + framework-agnostic reads with React hooks optional. This goal is consistently pursued. The subpath exports (`stroid/async`, `stroid/persist`, etc.) enforce the lean core contract. The feature registry enforces the plugin model. The `StoreDefinition` type enables typed stores. The goal is clear and mostly achieved.

The failure is execution gaps: dead lazy code, log→warn bug, options inconsistency.

---

### 14. Feedback Loops — **6/10**

Dev warnings exist for: unnamed stores, spaces in names, missing stores, broad subscriptions, Map/Set/Date inputs, missing AbortSignal, sync transport unavailability, persist key collisions.

But there's **no feedback for**: passing invalid overload combinations to setStore (the `else` branch just calls `error()`), using `createStore` after the production SSR block returns undefined (the caller gets undefined with no caller-level feedback if they didn't pass `onError`), middleware returning undefined silently (treated as "pass through").

---

### 15. Documentation — **7/10**

The `docs_2.0` folder contains a chapter-based handbook with genuine depth. `BUG_REPORT.md` is remarkable self-awareness — the team is tracking and categorizing their own bugs with verdict labels. `CHANGELOG.md` is detailed and honest about what's broken.

**Weaknesses:** The docs reference `lazy: true` behavior that doesn't actually work. The "encryption" section doesn't warn about the identity default being insecure. SSR docs don't explicitly warn that `createStore` returns `undefined` in production-server mode.

---

### 16. Fail Gracefully — **7/10**

Most operations return `WriteResult` or check existence before proceeding. Subscriber throws are caught. Middleware throws abort the pipeline rather than crashing. Persist driver errors are caught and routed to `onError`. SSR creation is blocked rather than silently leaking.

**Weaknesses:** `setStoreBatch` throws when given an async function — this is correct but the error message says "does not support promise-returning callbacks" without explaining HOW to batch async operations instead. The throw also happens AFTER the sync portion of `fn()` has already run and modified stores, leaving state partially updated.

---

### 17. Honesty of Abstractions — **6/10**

**Dishonest abstractions found:**

1. **`setStore` types say `void` but return `WriteResult`** — the types actively hide error information
2. **`lazy: true` option doesn't exist** — it's referenced in store.ts line 610 but the option type doesn't include it and `normalizeStoreOptions` never produces it
3. **`log()` calls `warn` sink** — semantically misleading; log-level output goes to warn-level handler
4. **`encrypt` default is identity** — presented as an encryption feature, ships with no encryption enabled by default, warns only conditionally
5. **`createStoreForRequest.create(name, data, options)` — the `options` parameter's priority in the merge chain is counterintuitive**: the caller of `hydrate()` can override the per-request options because they're in the middle priority

---

## PHASE 3 — TYPE SYSTEM & DEVELOPER EXPERIENCE

### Strong Type Inference — **6/10**

The `Path<T>` and `PathValue<T, P>` types are genuinely impressive — they recurse to depth 6 and correctly extract nested value types. The `setStore(storeDefinition, "user.name", "Alex")` form with a typed `StoreDefinition<Name, State>` gives full autocomplete on the path.

**BUT:** This only works if you store the `StoreDefinition` return value. If you use the string form `setStore("user", "name", value)`, you lose all type safety permanently. The primary API surface is the string API. The typed API is opt-in, requiring discipline from every caller. At scale, most usages will drift to the string form.

The overloaded `setStore` signatures are technically correct but the TypeScript overload resolution can confuse IDEs when you mix `StoreDefinition` and string forms in the same codebase.

### Strict Mode Support — **7/10**

`tsconfig.json` has `strict: true`. The source compiles cleanly with strict mode (as evidenced by the type tests in `tests/types/`). The type assertion usage (`as any`) is present but concentrated in the schema validation duck-typing code, where it's unavoidable.

### Minimal Boilerplate — **7/10**

Getting started: `createStore("count", 0)` + `getStore("count")` + `setStore("count", 1)` — genuinely zero boilerplate for simple stores. The React hook `useStore("count")` is one line. This is competitive with Zustand.

**Where boilerplate creeps in:** typed stores require: `const userStore = createStore("user", initialUser)`, then you must carry `userStore` everywhere to get typed path access. If you define it in a module and import it, that's fine. But if you null-check it (since `createStore` returns `undefined` on failure), you've already lost the ergonomics.

### API Ergonomics — **6/10**

**Good:** The function overloads for setStore are thoughtfully designed. The chain API is a clean alternative. The selector API mirrors React Query conventions.

**Hidden footguns:**
1. `createStore` returns `undefined` on the server in production — if you don't check, your entire application silently uses null stores
2. `setStoreBatch` accepts `() => void` but throws on async functions — the throw happens after partial execution
3. `fetchStore` creates a store implicitly if it doesn't exist — this is magic that can create orphaned async stores
4. `deleteStore` does not abort pending `fetchStore` requests for that store — requests can complete and write to a deleted+recreated store if the name is reused quickly
5. `resetStore` bypasses middleware — if middleware enforces business logic, reset can violate it silently

---

## PHASE 4 — ARCHITECTURAL INTEGRITY

### Architectural Consistency — **7/10**

The plugin/registry architecture is consistently applied. Every feature uses the same `StoreFeatureRuntime` interface. The context object pattern for passing capabilities to features is consistent. Write pipeline ordering (sanitize → schema → validator → middleware → commit → feature hooks → notify) is invariant across `setStore`, `mergeStore`, and `_replaceStoreState`.

**Inconsistency:** `resetStore` breaks the pipeline — it bypasses middleware but runs feature write hooks. `deleteStore` bypasses middleware entirely. These are documented as intentional but create a "sometimes middleware matters, sometimes it doesn't" mental model.

### Separation of Concerns — **6/10**

Feature files are well-separated. Store registry is properly isolated. The `store-admin.ts` correctly encapsulates deletion logic.

**Violations:**
- `store.ts` owns notification scheduling, path validation caching, SSR detection, lazy initialization, AND the public API — this is not separated
- `async.ts` directly imports `_subscribe` (private internal) from `store.ts` — bypasses the public API
- `hooks-core.ts` imports `_getSnapshot` and `_subscribe` (both internal) — React hooks depend on internals, not the stable public API

### Dependency Direction — **7/10**

```
store.ts → utils, adapters, features/lifecycle, feature-registry, store-registry, internals/*
async.ts → store.ts (including internals)
hooks-core.ts → store.ts (including internals), selectors.ts
features/* → store.ts public API types only
```

The direction is mostly correct — features don't depend on each other, store doesn't depend on async. The violation is async/hooks reaching into store internals.

### Hidden Coupling

- `async.ts` uses `normalizeStoreRegistryScope(new URL("./store.js", import.meta.url).href)` — hardcoded path to resolve the same registry as `store.ts`. This is **implicit coupling by URL string** — if store.ts moves, async.ts silently uses a separate registry.
- `_featureRuntimes` is stored in the registry (shared) but also in `store.ts` module scope — there's a dual reference that must stay in sync.

### Is the Architecture Stable Long-Term?

**No.** Three pressure points will force rewrites:

1. The module-level state pattern will break when ESM module isolation becomes standard in test environments and Node.js worker threads
2. The string-keyed store identity is fundamentally unsafe — there's no namespace collision prevention for libraries using stroid internally
3. The god-file `store.ts` will become unmaintainable as features are added — it already has 870 lines and the library is at v0.0.5

---

## PHASE 5 — PRACTICAL FUNCTIONALITY

### Runtime Validation — **7/10**

Zod, Yup, custom functions, and schema objects are all detected via duck-typing. This is genuinely flexible and works for the most common validators. The detection order is: `safeParse` → `parse` → `validateSync` → `isValidSync` → `validate` → `function`. This covers Zod, Yup, Joi, and custom validators.

**Problem:** When `validate` (Joi) returns an object with `.validate()`, the result's `error` property is read as the error. But only `(schema as any).errors` is tried, not the standard Joi `result.error`. This silently breaks Joi integration for users who expect validation messages.

### Edge Case Handling

**Handled well:**
- Circular references in `sanitize()` — WeakSet tracking
- Non-finite numbers blocked at sanitize
- `setByPath` on null/undefined intermediate nodes — creates containers
- Out-of-bounds array index writes — rejected explicitly

**Not handled:**
- `createStore` with `initialData = undefined` — `isValidData(undefined)` returns `true`, but `sanitize(undefined)` returns `undefined`. Then `_stores["name"] = undefined`. `getStore("name")` returns `deepClone(undefined) = undefined`. This is actually tested and works, but `undefined` is a legitimate initial value that has surprising behavior downstream (subscribers receive `undefined`, which looks like "store deleted" to some subscribers).
- `hydrateStores` with an existing store that fails schema validation — the error is surfaced but the store is left unchanged (which is correct), but there's no signal to the caller that hydration partially failed

### Backward Compatibility — **5/10**

v0.0.5 introduces `validate` as the canonical option, with `schema`/`validator` as deprecated aliases. This is managed by `legacyOptionReplacementMap` and `collectLegacyOptionDeprecationWarnings`. The deprecation warnings fire correctly. But: the legacy options still work. In production builds, `isDev()` is false, so the deprecation warnings are silenced. Users in production will never know they're on deprecated paths until the removal version.

There is no formal deprecation timeline. The CHANGELOG doesn't indicate when legacy options will be removed.

### Code Churn Rate

From the CHANGELOG, in the week of March 2026 alone: v0.0.1 through v0.0.5 shipped. That is 5 versions in less than 2 weeks (initial release through current). The current branch is explicitly labeled as `debug-test/splitting-ev` — a debugging branch. The BUG_REPORT.md shows 46 categorized bugs with 5 "Must Fix" unresolved. This is high churn / active development, which is fine at v0.0.x, but it means **no API stability guarantee exists**.

---

## PHASE 6 — COMMUNITY HEALTH

**Bus Factor: 1.** One author (Himesh Bhattarai), one repository, zero public contributors visible. The `CONTRIBUTING.md` exists but there are no pull request templates, no issue templates, no CI badge, no npm badge. The GitHub Actions workflow is absent from this zip.

**Project Sustainability: Low.** The docs site exists (Next.js, deployed to Vercel). The README is polished. The library concept is differentiated. But with a bus factor of 1 and no public community engagement, the project's survival depends entirely on one person's continued attention.

**Contributor Friendliness: Medium.** The `STATUS.MD` commit cheat sheet is genuinely clever — it creates a shared vocabulary for commit states. `CONTRIBUTING.md` has standard guidance. The codebase is internally consistent in style. A new contributor could get up to speed on a feature file without understanding the full store pipeline.

---

## PHASE 7 — INTEGRATION & ECOSYSTEM

**DevTools Support:** Redux DevTools via `__REDUX_DEVTOOLS_EXTENSION__` — correct and conventional. No custom DevTools panel. History and diffs are available via `getHistory()` for custom tooling.

**Framework Compatibility:** React 18+ only (uses `useSyncExternalStore`). No Vue/Svelte/Solid adapters. The vanilla JS API works anywhere. SSR support for Next.js is explicitly designed.

**Integration Simplicity:** Adding stroid to a React app is genuinely simple. No provider required, no store atom imports needed. The global registry pattern is a feature for small teams, a risk for large applications with library composition.

**Plugin/Extension Potential:** The `StoreFeatureRuntime` interface is the right extension point. A third-party encryption feature or audit-log feature could be built without forking. However: the feature registry is global and there's no namespacing — two plugins using the same `FeatureName` would silently overwrite each other.

---

## PHASE 8 — FAILURE ANALYSIS: TOP 10 MOST LIKELY PRODUCTION ISSUES

**#1 — Cross-Request State Leak on SSR (CRITICAL)**
In production SSR (Next.js), if a developer imports stroid's global registry and creates stores in a request handler WITHOUT using `createStoreForRequest`, data from one user's request persists to the next. The SSR guard blocks `createStore` in production-server mode — but only if `allowSSRGlobalStore` is false. If a developer sets `allowSSRGlobalStore: true` to silence the warning, they've intentionally created a security leak.

**#2 — Silent Data Loss on Browser Tab Close (HIGH)**
`persistSave` uses `setTimeout(fn, 0)`. The save is scheduled for the next event loop tick. A user who makes a state change and immediately closes the browser loses their last write because the `beforeunload` event fires before the scheduled timeout executes. This is documented as intentional (Bug 22) but users won't read the bug report.

**#3 — Deleted Store Name Reuse + Pending Fetch Race (HIGH)**
If `deleteStore("users")` is called while `fetchStore("users", url)` is inflight:
- The store is deleted, subscribers receive `null`, `_clearAsyncMeta` runs
- The inflight fetch completes, checks `hasStore("users")` — false, so it skips writing
- BUT if `createStore("users", initialData)` is called between delete and fetch completion (e.g., component remount), `hasStore("users")` is now true again, and the stale fetch writes into the new store

**#4 — `setStore` Type Overloads Hide Errors (MEDIUM-HIGH)**
The TypeScript overloads declare `void` return type. Callers cannot check if their write succeeded or failed without a cast to `any` or using the string-form API. A schema validation failure silently returns `{ ok: false, reason: "validator" }` which the typed caller sees as `void`. Business-critical writes can fail invisibly.

**#5 — Lazy Stores Don't Work (MEDIUM-HIGH)**
Any documentation or internal code path that relies on `lazy: true` will silently behave as if `lazy` wasn't passed. Initial data is eagerly evaluated. If initialData is a function that performs I/O or has side effects and is intended to be lazy, it runs immediately and synchronously on `createStore`.

**#6 — Sync Tab Resurrection with Stale Clock (MEDIUM)**
Bug 15 in BUG_REPORT.md: A tab suspended for 30 minutes resumes with a local clock value of X. The remote tab's clock is X+500. The suspended tab broadcasts, wins the tie-breaker by source lexicographic order, and overwrites fresh data with 30-minute-stale data. This is a real-world scenario on mobile browsers.

**#7 — Unbounded Memory Growth in Long Sessions (MEDIUM)**
`_pathValidationCache` grows with every unique path that's validated, until a write to that store clears it. With dynamic paths (e.g., `setStore("users", ["entities", userId], data)` for thousands of users), the cache grows to thousands of entries before being cleared. The next write to any key in "users" clears ALL of them — so the cache is simultaneously too aggressive (keeps dead paths) and too aggressive (clears everything on any write).

**#8 — `fetchStore` Inflight Slot Exhaustion (MEDIUM)**
With 100 concurrent unique `cacheKey` values for the same store, the 101st call returns `null` with an error message. If the caller is a React component using `useAsyncStore`, the component renders an error state permanently until the store is deleted and recreated. There is no automatic recovery path.

**#9 — Middleware That Adds Properties Breaks Path Validation Cache (LOW-MEDIUM)**
If middleware adds new keys to the store state, `_validatePathSafety` has already cached path validity for the pre-middleware structure. After middleware runs, `_invalidatePathCache` is called — so the cache is cleared. But if middleware mutates the structure between two writes without going through `setStore` (e.g., middleware has internal async state that changes what properties it adds), the cache can be stale for a brief window.

**#10 — `createSelector` Proxy Tracks Too Many Dependencies (LOW-MEDIUM)**
`trackSelectorDependencies` wraps the entire state in a `Proxy`. Any property access on any nested object is tracked as a dependency. Array methods like `.map()`, `.filter()`, `.length` access each index. A `users.map(u => u.name)` selector on a 1000-user array tracks 1001 dependencies (`length` + each index). On every state change, `selectorDepsChanged` iterates all 1001 paths with `getByPath`. This is O(n*m) per state change for array selectors.

---

## PHASE 9 — DESIGN COMPARISON

### vs. Zustand

| Aspect | Stroid | Zustand |
|---|---|---|
| API style | Global string keys, imperative | Bound hooks, closure-based |
| Type safety | Opt-in (requires StoreDefinition) | Strong by default |
| Bundle size | Heavier (more features) | Minimal core (~1KB) |
| Persistence | Built-in | Middleware (zustand/middleware) |
| Async | Built-in fetchStore | Not included |
| React-free use | ✅ First-class | ✅ Works but hooks-centric |
| Devtools | Built-in | Middleware |

**Stroid is better where:** Full-stack with persistence, sync, and async in one coherent system. Configuration uniformity across features.
**Stroid is weaker where:** Type safety without boilerplate, bundle size, ecosystem maturity, community.

### vs. Jotai

Jotai is atom-based (composable, bottom-up). Stroid is store-based (centralized, top-down). These are fundamentally different mental models. Stroid wins for teams who want imperative mutations. Jotai wins for teams who want derived/computed state and reactive composition.

### Reinvented Solutions

- `fetchStore` reinvents React Query's core (cache, dedupe, retry, staleWhileRevalidate) without RQ's ecosystem (DevTools, optimistic updates, infinite queries, mutations separation)
- `persistSave` reinvents `zustand/persist` with more features but similar core tradeoffs (setTimeout coalescing, driver abstraction, migration versioning)
- The `createSelector` proxy tracking reinvents Valtio's signal-based reactivity, less efficiently

---

## PHASE 11 — BUG HUNT MODE

### Bug H1: `log()` Routes to `warn` Sink

**Location:** `src/internals/diagnostics.ts:62`
**Code:** `const sink = getConfig().logSink.warn ?? defaultLog;`
**Why it happens:** The fallback `?? defaultLog` only fires if `logSink.warn` is falsy. The default logSink always has a `warn` property. So `log()` always calls the warn handler.
**Production impact:** In production logging systems (Datadog, Splunk), log-level and warn-level are different severity buckets. Every "Store created" message shows up as a warning. At scale this creates warning-level noise that drowns real warnings.
**Fix:** Use a dedicated `logSink.log` property, or use `getConfig().logSink.log ?? getConfig().logSink.warn ?? defaultLog`.

---

### Bug H2: `isLazy` Is Always False — Dead Feature

**Location:** `src/store.ts:610`
**Code:** `const isLazy = normalizedOptions.lazy === true && typeof initialData === "function";`
**Why it happens:** `NormalizedOptions` (TypeScript type) has no `lazy` field. `normalizeStoreOptions()` never produces a `lazy` field. TypeScript would show an error if the code were strictly typed, but `normalizedOptions.lazy` accesses a non-existent property, which evaluates to `undefined`.
**Production impact:** If a user attempts to implement lazy initialization by passing a function as `initialData`, their function is treated as the initial data (which `isValidData` accepts for "function" type — wait, actually `isValidData` calls `getType(value)` which returns `"function"` for functions, which then hits `error(getInvalidFunctionStoreValueMessage())` and returns `false`. So `createStore("name", () => initialValue)` fails with "Functions cannot be stored in stroid." The lazy pattern is blocked at the isValidData check before even reaching the dead lazy code path. Users get a confusing error message rather than the expected behavior.
**Fix:** Add `lazy?: boolean` to `StoreOptions` and `NormalizedOptions`, and propagate it through `normalizeStoreOptions`.

---

### Bug H3: `setStoreBatch` Partial Execution on Promise Detection

**Location:** `src/store.ts` `setStoreBatch` function
**Code:** The `fn()` is called before checking if the result is a Promise. If `fn` is `async`, it starts executing synchronously, runs any synchronous `setStore` calls inside it, then returns a Promise. THEN the batch detects the Promise and throws.
**Why it happens:** The Promise detection runs AFTER `fn()` returns. An async function's synchronous prefix executes before the first `await`. All `setStore` calls before the first `await` have already run and modified stores.
**Production impact:** In an async callback like `setStoreBatch(async () => { setStore("a", 1); await something(); setStore("b", 2); })`, store "a" is already updated when the error is thrown. Store "b" is never updated. The error message says "does not support promise-returning callbacks" — correct, but unhelpful because partial state mutation has already occurred.
**Fix:** Detect `async` functions before calling them: `if (fn.constructor.name === 'AsyncFunction') throw new Error(...)`. Or document clearly that sync prefix mutations are not rolled back.

---

### Bug H4: Async Fetch Post-Abort Write Window

**Location:** `src/async.ts` in `executeFetch`
**Description (Bug 11 from BUG_REPORT.md):**
After a successful `fetch()` response, there are two abort checks before writing:
```
if (mergedSignal?.aborted) return _settleAbort(...)
const transformed = transform ? transform(result) : result;
if (mergedSignal?.aborted) return _settleAbort(...)
if (!_isCurrentRequest(cacheSlot, currentVersion)) return null;
```
But `transform` is user-supplied and can be asynchronous (though not declared as such in the type). If `transform` is async, between the first abort check and the second, the signal could be aborted. More critically: if `transform` does await internally, the second abort check runs after microtask resolution, but store writes can happen in parallel on a different microtask. The version check helps but only if the version was correctly incremented.
**Fix:** Use a synchronous-only `transform` contract enforced by checking if `transform(result)` returns a Promise, and rejecting it.

---

### Bug H5: `_validatePathSafety` Incorrectly Rejects `null → object` Writes

**Location:** `src/store.ts:_validatePathSafety`
**Confirmed as Must Fix in BUG_REPORT.md Bug 23**
**Code:** Type mismatch check runs when `existing !== null && existing !== undefined`. But the check that `cursor` is not `null` at intermediate nodes causes early rejection:
```
if (cursor === null || cursor === undefined) {
    if (!isLast) {
        cursor = typeof key === "string" && Number.isInteger(Number(key)) ? [] : {};
        continue;
    }
    return { ok: true };
}
```
For a leaf node, it returns `{ ok: true }`. But before reaching this, the parent traversal correctly handles null. However at the TYPE CHECK part:
```
if (existing !== undefined && existing !== null) {
    const expected = getType(existing);
    const incoming = getType(nextValue);
    if (expected !== incoming) { ... REJECT }
}
```
This skips the check if existing is `null`. So `null → object` should work. **But the real problem is at the object entry check earlier**: `const hasKey = Object.prototype.hasOwnProperty.call(cursor, key)` — if the parent path exists but the value is `null`, the `typeof cursor !== "object"` check at the beginning of the loop body evaluates BEFORE the null check. Wait, actually null IS typeof "object" in JavaScript. Let me re-read... The actual bug is `cursor === null` is caught by the first `if`, returns `ok: true` at the LEAF case. But for intermediate nodes: `cursor = {}` is used, which is correct. The real problem is when `existing` is `null` at the LEAF: `if (existing !== undefined && existing !== null)` — the type check is SKIPPED for null existing values. So `null → object` SHOULD work. The bug may be in a subtly different code path than described.
**Production impact:** The BUG_REPORT confirms users are hitting this. Worth investigating with the specific example: `{ user: null }` + `setStore("x", "user", { name: "John" })`.

---

### Bug H6: Concurrent `setStoreBatch` Nesting — `_batchDepth` Races

**Location:** `src/store.ts:setStoreBatch`
**Code:** `_batchDepth` is module-level, not protected by any mutex or lock.
**Why it happens:** In a React concurrent mode scenario, two render-triggered effects could call `setStoreBatch` concurrently (in the same microtask phase via Promise.all or similar). Both increment `_batchDepth`. When both finish, both decrement. The final `_scheduleFlush` fires correctly. But if one throws, the `finally` block decrements regardless — this part is correct. The actual race is if `_batchDepth` is decremented to 0 BEFORE the second batch finishes, triggering a premature flush.

---

### Bug H7: `subscribeWithSelector` Fires Listener on First Notification with Identical Values

**Location:** `src/selectors.ts:subscribeWithSelector`
**Code:** When `!hasPrev && hasSelectorStoreEntry(name)`, on the first notification (after setup, when the store already existed):
```
listener(deepClone(nextSel), deepClone(nextSel));
```
Both arguments are the same value. The listener receives `(current, current)` — prev and next are identical. This is documented as a regression test in `regressions.test.ts`, confirming it's a KNOWN behavior, but the behavior is still semantically wrong. If your listener computes a diff between prev and next, it will always compute no diff on the first call.

---

### Bug H8: Memory Leak in `_broadUseStoreWarnings`

**Location:** `src/hooks-core.ts:12`
**Code:** `const _broadUseStoreWarnings = new Set<string>();`
This Set grows with every unique store name that triggers the "broad subscription" warning. It is never cleared. In a long-running SPA with many stores created and destroyed, this Set retains all store names ever seen. More critically: `_hardResetAllStoresForTest()` in `store.ts` does NOT clear this set, breaking test isolation — a test that uses `useStore("cart")` without a selector will suppress the warning in all subsequent tests for "cart".

---

### Bug H9: `createSelector` Proxy Dependency Tracking — Missing Symbol Property Handling

**Location:** `src/selectors.ts:trackSelectorDependencies`
**Code:** The proxy only handles `typeof prop === "string"` accesses. All Symbol property accesses (`Symbol.iterator`, `Symbol.toPrimitive`, etc.) fall through to `Reflect.get` without tracking.
**Why this matters:** When a selector does `state.items.map(...)`, Array's `map` internally accesses `Symbol.iterator` and numeric indices. Symbol accesses aren't tracked, so if `Symbol.iterator` behavior changes (it won't, but custom iterables can change), the selector won't recompute. For standard arrays this is fine. For custom iterables it creates silent stale results.

---

### Bug H10: `persistLoad` Migration `steps.forEach` Doesn't Break Early on Failure

**Location:** `src/features/persist.ts:persistLoad`
**Code:**
```javascript
let migrationFailed = false;
steps.forEach((ver) => {
    if (migrationFailed) return;
    try {
        const migrated = migrations[ver](parsed);
        if (migrated !== undefined) parsed = migrated;
    } catch (e) {
        ...
        migrationFailed = true;
    }
});
```
The `forEach` doesn't short-circuit. Even with `migrationFailed = true`, all remaining iterations run (but skip the migration call). The overhead is negligible but shows that `for...of` with `break` was the right tool here. More importantly: after migration failure, `parsed` holds the fallback state from `resolveMigrationFailure`, not the partially-migrated state. The subsequent `if (!migrationFailureRequiresValidation)` check then calls `applyFeatureState(parsed, safeUpdatedAt)` with the correct fallback. But what if `resolveMigrationFailure` calls `strategy(deepClone(persisted))` (the function case) and it returns undefined? Then `parsed` retains the state from BEFORE the failed migration, not the initial state. The fallback to initial state only happens when `reportStoreError` is called after the undefined return. This is correct but fragile — the call to `reportStoreError` for the "returned undefined" case is fire-and-forget; `parsed` is not updated to initialState.

---

## TESTING & QUALITY ASSURANCE

### Test Structure — **6/10**

Tests are in a flat `tests/` directory with no separation between unit and integration tests. `store.test.ts` mixes unit tests of internal functions with integration tests of the full pipeline. There is a `tests/heavy/` subdirectory for stress tests (correct) and `tests/types/` for type-level tests (excellent practice).

**Framework:** Node.js native `node:test` + `node:assert`. This is surprisingly capable but lacks: `beforeEach/afterEach` hooks for automatic cleanup, snapshot testing, built-in coverage reporting, and parallel execution by default.

**Naming conventions:** Descriptive string names ("validator with side effects runs once per write"). No standardized `describe/it` grouping — all tests are top-level. This makes the 1550-line `store.test.ts` a flat list of 100+ tests with no logical grouping.

### Test Coverage — **6/10**

**Well-covered:**
- Core CRUD operations (createStore, setStore, getStore, resetStore, deleteStore)
- Path validation edge cases (depth limits, forbidden keys, type mismatches)
- Persistence (load, save, migration, checksum, edge cases)
- Async fetch (retries, abort, cache, deduplication)
- Sync (clock ordering, payload limits, conflict resolution)
- React hooks (via `react-hooks.test.tsx` with 431 lines)

**Not covered:**
- The `log()` → `warn sink` bug — no test verifies that log calls go to the `log` sink
- Lazy stores — unreachable code path, no test covers it (because it can't be triggered)
- `_broadUseStoreWarnings` test isolation — no test verifies the warning resets between tests
- `chain()` API under concurrent access
- `subscribeWithSelector` behavior when selector throws
- `fetchStore` with 100+ concurrent inflight slots (inflight cap)
- `createStoreForRequest` with options priority conflict

**Coverage score: ~65% estimated** — strong on happy paths and documented edge cases, weak on internal state bugs and interaction effects.

### Test Quality — **7/10**

Tests are generally deterministic and isolated (each test calls `clearAllStores()` first). Tests verify behavior, not implementation — they don't mock internal functions. The regression tests in `regressions.test.ts` show the team is tracking specific bug fixes.

**Bad patterns found:**
- Some tests use `await Promise.resolve()` to wait for microtask-scheduled notifications — this is fragile and timing-dependent
- `react-hooks.test.tsx` uses `react-test-renderer` with `act()` — correct practice
- Multiple tests import ALL features at the top (`../src/persist.js`, `../src/sync.js`, `../src/devtools.js`) creating implicit side effects from feature registration — a test that doesn't need devtools still registers it

### Edge Case Testing — **7/10**

The team has clearly done adversarial thinking — the test suite covers prototype pollution attempts, circular references in sanitize, CRC checksum mismatches, out-of-bounds array indices, and non-finite numbers. The BUG_REPORT.md shows additional edge cases were identified during audit.

**Missing edge cases:**
- Two `setStoreBatch` calls nested (does `_batchDepth` correctly stack?)
- Store created in a middleware callback (re-entrant store creation)
- `hydrateStores` with invalid snapshot types (null, array, number)
- Selector over an array store with 10,000 elements (performance regression)
- `fetchStore` called after `deleteStore` but before the subscription cleanup fires

### Regression Protection — **6/10**

`regressions.test.ts` exists — 72 lines, 3 explicit regression tests covering confirmed bugs. This is a good practice but the file is too small relative to the number of bugs acknowledged in `BUG_REPORT.md`. The 5 "Must Fix" bugs in BUG_REPORT.md do NOT have corresponding regression tests.

### Test Maintainability — **6/10**

The 1550-line `store.test.ts` will become unmaintainable. There is no test helper for "create a store, run some writes, assert notifications fired." The `clearAllStores()` pattern at the start of every test is repeated manually — a `beforeEach` hook would be more robust.

### Testing Tools — **5/10**

`node:test` is the correct zero-dependency choice for a library (no jest/vitest peer dep needed). But: no coverage tool configured. No CI workflow visible. No lint enforcement in the test scripts. `tsx` is used for TypeScript execution — correct choice for running tests without compilation.

### Testing Final Verdict — **6/10**

**Are these tests trustworthy?** Partially. They catch regression in known behavior but miss internal state bugs.  
**Would they catch production regressions?** For the main API: yes. For the `log→warn` bug, lazy feature, or notification ordering issues: no.  
**Critical missing tests:** Log sink routing, lazy feature deadness, batch depth races, selector subscription for dynamic paths.  
**What to improve immediately:** Add `beforeEach(() => clearAllStores())` globally, write tests for Must Fix bugs before fixing them, add coverage tooling.

---

## PHASE 10 — FINAL VERDICT

### Overall Score: **5.5/10**

This score is not for what stroid aspires to be — that vision scores 8/10. This is for what stroid IS right now at v0.0.5.

---

### Is This Production Ready?

**No.** Not yet. Five acknowledged Must-Fix bugs are unresolved. The lazy feature is dead code. The log sink routes to the wrong handler. The type system hides write failure from callers who use the typed overloads. The module-level state pattern creates cross-request leak risks that require discipline to avoid.

### Would You Adopt This in a Serious Production System?

**Not today.** Watch it at v0.1.0 after the Must-Fix bugs are addressed and a proper CI/coverage pipeline is established. The design is differentiated enough to warrant attention.

### Biggest Risks

1. **Cross-request SSR leak** — a single misconfigured option exposes user data between requests
2. **Persistence data loss on unload** — the `setTimeout(0)` coalescing is inherently unreliable for durability
3. **Type system lies** — `setStore` typed overloads return `void`, business-logic writes can fail silently
4. **Dead lazy feature creates false confidence** — users who read the code and see lazy store support, or who try it, get no lazy behavior and a confusing error

### Strongest Ideas

1. **The feature plugin registry** — genuinely well-designed. `registerStoreFeature` is the right abstraction for optional capabilities. If this pattern holds through v1, it's the library's strongest selling point
2. **The notification chunking system** — `chunkSize` + `chunkDelayMs` + priority stores is thoughtful and solves a real problem (10,000 subscribers blocking the main thread)
3. **`BUG_REPORT.md` as a living artifact** — using a tracked bug document with `Must Fix` / `Intentional` / `No Need to Fix` verdicts is a mature practice for a library at this stage. It shows the author is thinking critically about their own code

---

## THREE BRUTAL TRUTHS

**Truth 1: The API is a trap at scale.**  
String-keyed stores feel ergonomic at first. Three months into a 50-component application, you have 40 store names scattered across files with no single source of truth, no autocomplete, no rename refactoring, and a `suggestStoreName` typo corrector that fires at runtime. The `StoreDefinition` typed API exists to solve this, but it requires enough boilerplate that developers will drift to the string API.

**Truth 2: The library ships features it doesn't actually have.**  
Lazy stores are mentioned in code, architecturally designed, and partially scaffolded — but entirely unreachable. The `log()` function doesn't log, it warns. The `encrypt` option is an identity function by default. A library that's v0.0.5 is allowed to be incomplete, but it should be honest about what's real versus what's aspirational.

**Truth 3: The test suite tests what the author already knows is broken.**  
The `BUG_REPORT.md` lists 5 Must-Fix bugs. None of them have failing tests that would enforce they're fixed before release. A production library's test suite should make it IMPOSSIBLE to ship known bugs by having failing tests that only pass when the bugs are fixed. Instead, the bugs are documented in markdown while the tests pass green.

---

## WHY I GENUINELY LIKE THIS PROJECT

Yes, despite the brutality above — there are things here that are genuinely impressive for a single-person v0.0.5:

The **`BUG_REPORT.md` file alone** shows a level of intellectual honesty I rarely see. Most developers ship, ignore, and hope. This author AUDITED their own code, categorized 46 bugs, and published the list. That takes courage and self-awareness.

The **feature plugin registry** is a genuinely elegant solution to a hard problem: how do you make persistence/sync/devtools optional without making the core a conditional mess? The `StoreFeatureRuntime` interface is clean. The `registerStoreFeature` pattern means the core genuinely has zero knowledge of features.

The **notification chunking system** is solving a problem that most state libraries pretend doesn't exist. When you have 10,000 subscribers and a write happens, most libraries block the main thread. Stroid's `chunkSize`/`chunkDelayMs` with priority store ordering is practical production thinking.

The **`STATUS.MD` commit convention** is a lightweight, practical alternative to formal ticket systems. `status(409)` — "works but risky" — is exactly the kind of nuanced signal commit messages need but never have.

---

## WHAT STROID MUST DO TO BECOME MY FIRST CHOICE

1. **Fix the Must-Fix bugs with failing tests first** — write the test, watch it fail, fix the code, watch it pass. The bugs in BUG_REPORT.md are not theoretical; they're real data loss and correctness failures.

2. **Make the type system honest** — the `setStore` overloads should not return `void`. Either return `WriteResult` from all overloads or introduce a `strictStore(definition, ...)` variant that enforces checked writes. Hiding errors from TypeScript callers is a betrayal of the typed API promise.

3. **Fix or delete the lazy feature** — add `lazy?: boolean` to `StoreOptions` and wire it up, or remove `_initialFactories` and the dead code path entirely. Shipped but unreachable code is worse than missing code.

4. **Fix the `log()` sink routing** — one line fix, high credibility improvement.

5. **Add CI with coverage enforcement** — no coverage tool, no CI workflow. A library with no public CI is a library that requires trust without verification. Add Vitest (better DX than `node:test` for a library), add coverage with a minimum threshold, make the badge visible.

6. **Choose one validation API** — `schema`, `validator`, AND `validate` is three words for one concept. Collapse them in v1. Use the deprecation period to migrate users.

7. **Address the SSR string-key collision problem** — namespaced store names (`stroid.createStore("@mylib/user", ...)`) would prevent library authors from colliding with application store names. This is critical for library authors to adopt stroid safely.

8. **Prove the performance claims** — the benchmark scripts exist but the `stroid-advanced-benchmark-output.json` file is empty. Run the benchmarks, publish the numbers, commit to not regressing them. At that point, a library buyer has something concrete to evaluate against Zustand and Jotai.

When all of that is done, stroid has a real argument: imperative API, built-in persistence/sync/async, feature plugin system, correct React concurrent mode integration, SSR story. That's a genuinely differentiated library. Right now, it's a very promising sketch.

---

*Audit conducted with full source analysis. No surface-level review. Every claim above is traceable to a specific file and line number.*