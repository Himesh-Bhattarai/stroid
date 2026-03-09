# Bug Report

Scanned against the current source:

- [store.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store.ts)
- [async.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/async.ts)
- [utils.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/utils.ts)
- [features/sync.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/sync.ts)
- [features/devtools.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/devtools.ts)
- [adapters/options.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/adapters/options.ts)
- [hooks-core.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/hooks-core.ts)
- [chain.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/chain.ts)
- [server.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/server.ts)

Categories used:

- `Must Fix`
- `Intentional`
- `No Need to Fix`

## Current Verification Note

- `tests/store.test.ts` still has a failing case at [tests/store.test.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/tests/store.test.ts#L770) named `temp stores warn when persistence is explicitly enabled`.
- Status:
  This is a current verification failure discovered during the release-hardening pass. It should be treated as unresolved until the underlying cause is confirmed and fixed.

## Must Fix

### Bug 10

- Verdict: `Must Fix`
- Reason:
  Async middleware can return a `Promise`, and `runMiddleware(...)` currently treats any non-`undefined` return as the next state. That means a `Promise` can be committed into the store.

### Bug 11

- Verdict: `Must Fix`
- Reason:
  For direct `Promise` inputs to `fetchStore(...)`, abort is only checked before the await loop. If the promise resolves after abort, the result can still be applied because there is no post-await abort re-check before cache/store writes.

### Bug 23

- Verdict: `Must Fix`
- Reason:
  `_validatePathSafety(...)` blocks `null -> object` and `null -> array` leaf replacement because it enforces exact type matching on path writes. That is a common real-world initialization pattern and currently behaves too strictly.
- Example:
  `{ user: null }` cannot become `{ user: { name: "John" } }` through `setStore("x", "user", {...})`.

### Bug 27

- Verdict: `Must Fix`
- Reason:
  `createStoreForRequest(...).create(name, data, options)` accepts `options` in the public API shape but ignores them completely in [server.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/server.ts). That is a misleading API contract.
- Fix direction:
  either store and apply the options during `hydrate(...)`, or remove the parameter from the public request-buffer API.

### Bug 42

- Verdict: `Must Fix`
- Reason:
  Persisted state loaded during store creation does not update store metadata `updatedAt`. Then sync startup records a local sync version from the fresh creation timestamp, not from the age of the restored data. That can make restored stale data look newer than it really is in sync ordering.

### Bug 15

- Verdict: `Must Fix`
- Reason:
  This is the same underlying sync-ordering weakness as Bug 1, but with a realistic suspended-tab scenario. The current design assumes timestamp skew is tolerable. For ordinary convergence that is acceptable, but suspended-tab resurrection makes the risk concrete enough that it should be treated as a real correctness weakness, not just a theoretical note.
- Note:
  If you keep the current ordering model, at minimum this needs explicit documentation as a known sync limit.

## Intentional

### Bug 1

- Verdict: `Intentional`
- Reason:
  Sync ordering is based on local logical clocks plus timestamps plus source tie-breakers. That is deterministic ordering, not true causality. It is a design tradeoff, not a hidden bug.

### Bug 2

- Verdict: `Intentional`
- Reason:
  Object-merge `setStore(name, { ... })` is intentionally permissive unless `schema` or `validate` is present. Path writes are the stricter API; object merges are the flexible API.

### Bug 6

- Verdict: `Intentional`
- Reason:
  Proxy-based dependency tracking is the core behavior of `createSelector(...)`. It is expensive by design because tracked selector reuse is the feature being bought.

### Bug 7

- Verdict: `Intentional`
- Reason:
  The report is partly inaccurate. Duplicate `createStore(...)` does not return `undefined`; it returns `{ name }`. Genuine failure paths can still return `undefined`, and that is the current API design.

### Bug 8

- Verdict: `Intentional`
- Reason:
  Out-of-bounds array index path writes are deliberately rejected by `_validatePathSafety(...)`. This matches the broader Stroid policy of blocking silent path creation.

### Bug 13

- Verdict: `Intentional`
- Reason:
  `getStore(...)` always deep-clones as a public safety guarantee. This is a deliberate defensive-read policy.

### Bug 16

- Verdict: `Intentional`
- Reason:
  Devtools history cloning cost is real, but `devtools` is opt-in and `historyLimit: 0` disables history retention entirely. This is an explicit tradeoff, not surprise work in lean core.

### Bug 22

- Verdict: `Intentional`
- Reason:
  `persistSave(...)` uses `setTimeout(..., 0)` to coalesce writes. That means sudden unload can beat persistence. This is a durability tradeoff in favor of batching, not a hidden correctness bug.

### Bug 29

- Verdict: `Intentional`
- Reason:
  `sanitize(...)` rejecting `Map` keys that are not strings is deliberate JSON-safety policy. Auto-coercing everything to string would be more magical and less explicit.

### Bug 30

- Verdict: `Intentional`
- Reason:
  `subscribeWithSelector(...)` deep-clones `next` and `prev` before invoking listeners. That cost is the safety tradeoff for protecting consumers from mutating shared selected values.

### Bug 32

- Verdict: `Intentional`
- Reason:
  Inline selector functions in React causing recompute is normal selector-identity behavior. The hook does not stabilize a new selector function for the user.

### Bug 44

- Verdict: `Intentional`
- Reason:
  `resetStore(...)` bypasses middleware and goes straight to reset behavior plus feature hooks plus `onReset`. That is a policy choice: reset is not treated as a normal set/merge pipeline.

### Bug 46

- Verdict: `Intentional`
- Reason:
  `deleteStore(...)` does not run middleware. There is no `next` state to transform, and delete behavior is handled through lifecycle and feature delete hooks instead.

## No Need to Fix

### Bug 3

- Verdict: `No Need to Fix`
- Reason:
  Deep recursion in `_deepCloneFallback(...)` is a real pathological limit, but it is only the final fallback after `structuredClone` and JSON clone. This is edge hardening, not a release blocker.

### Bug 4

- Verdict: `No Need to Fix`
- Reason:
  The async maps do not leak on store deletion. `_ensureCleanupSubscription(...)` plus `_clearAsyncMeta(...)` clear per-store async state when the store is deleted. If the app creates unlimited live stores and never deletes them, growth is expected across the whole runtime, not an async-specific leak.

### Bug 5

- Verdict: `No Need to Fix`
- Reason:
  Already prevented. `_validatePathSafety(...)` rejects missing paths and warns. Misspelled path writes do not silently create new properties anymore.

### Bug 9

- Verdict: `No Need to Fix`
- Reason:
  Already fixed. Legacy warning reset is now part of the test reset path.

### Bug 12

- Verdict: `No Need to Fix`
- Reason:
  Developer-supplied schema functions executing developer code is not a library vulnerability. If untrusted code can inject a function here, the host app already has a much larger execution problem.

### Bug 14

- Verdict: `No Need to Fix`
- Reason:
  The premise is wrong. `fetchStore(...)` does not reject on fetch failure; it resolves `null` after writing error state. So the “promise rejects while stale data still exists” inconsistency described here is not how the current implementation behaves.

### Bug 17

- Verdict: `No Need to Fix`
- Reason:
  `_broadUseStoreWarnings` can grow with many unique store names, but this is a tiny warning-suppression set in the React layer. It is not a meaningful leak in practical terms.

### Bug 18

- Verdict: `No Need to Fix`
- Reason:
  `target()` already requires a `string` at the type level, and runtime guards warn on bad usage. JavaScript callers can still misuse it, but the current behavior is guarded enough for a low-risk ergonomic edge.

### Bug 19

- Verdict: `No Need to Fix`
- Reason:
  This is not hidden behavior. `chain(...)` is just a fluent path API on top of `getStore(...)`/`setStore(...)`. It does not promise automatic creation of missing parents.

### Bug 20

- Verdict: `No Need to Fix`
- Reason:
  Migration code already has a recovery path for bad shapes through `resolveMigrationFailure(...)`. Losing incompatible primitive old state under the default `"reset"` strategy is consistent with the configured recovery policy.

### Bug 21

- Verdict: `No Need to Fix`
- Reason:
  The checksum is for persisted payload integrity before parse/migrate, not for proving migration correctness afterward. Schema validation is the post-migration correctness gate.

### Bug 24

- Verdict: `No Need to Fix`
- Reason:
  Not a bug. Merge uses action `"set"`? No. `mergeStore(...)` passes action `"merge"` into middleware and `onSet` into lifecycle, which is coherent with the current design.

### Bug 25

- Verdict: `No Need to Fix`
- Reason:
  `refetchStore(...)` using the last registered fetch options is the current documented model. That is ordinary “last fetch definition wins” behavior, not corruption.

### Bug 26

- Verdict: `No Need to Fix`
- Reason:
  `_pruneAsyncCache(...)` sorting cost is real but bounded by `MAX_CACHE_SLOTS_PER_STORE = 100`. This is not an unbounded event-loop killer in the current design.

### Bug 28

- Verdict: `No Need to Fix`
- Reason:
  `hashState(...)` cost is part of the persistence/sync checksum tradeoff. It is opt-in work paid only when those features are enabled.

### Bug 31

- Verdict: `No Need to Fix`
- Reason:
  Not a bug. The cached selector behavior described is already correct.

### Bug 33

- Verdict: `No Need to Fix`
- Reason:
  Not a bug. `useStore(path)` returning `null` when the path yields `undefined` is current behavior and consistent with the hook’s nullish read posture.

### Bug 34

- Verdict: `No Need to Fix`
- Reason:
  `diffShallow(...)` being shallow is deliberate. Devtools history diff is informative, not recursive structural diff.

### Bug 35

- Verdict: `No Need to Fix`
- Reason:
  The reported error path is already guarded. `requestSyncSnapshot(...)` checks whether the channel still exists before posting. If the store was deleted and resources were closed, it returns quietly.

### Bug 36

- Verdict: `No Need to Fix`
- Reason:
  Possible late broadcast during delete timing is harmless noise, not a correctness bug. Receivers already gate on store name and source logic.

### Bug 37

- Verdict: `No Need to Fix`
- Reason:
  Not a bug. Aborted inflight entries are cleared in `finally`, so later callers do not stay deduped to a dead request.

### Bug 38

- Verdict: `No Need to Fix`
- Reason:
  Aborts resolving to `null` rather than rejecting is a design decision. The store status is the richer signal if the caller needs to distinguish abort.

### Bug 39

- Verdict: `No Need to Fix`
- Reason:
  Expired cache not being treated as usable stale data is a TTL policy choice. The current behavior is coherent: expired means no longer valid for stale reuse.

### Bug 40

- Verdict: `No Need to Fix`
- Reason:
  Evicting still-valid entries when the cache slot cap is exceeded is normal bounded-cache behavior.

### Bug 41

- Verdict: `No Need to Fix`
- Reason:
  The per-store inflight cap is deliberate backpressure. Starving some requests beyond the cap is preferable to unlimited inflight growth.

### Bug 43

- Verdict: `No Need to Fix`
- Reason:
  Not a bug. The described batching/cancel behavior is exactly how deferred persistence coalescing is supposed to work.

### Bug 45

- Verdict: `No Need to Fix`
- Reason:
  Not a bug. `mergeStore(...)` does run `onSet`.

### Bug 47

- Verdict: `No Need to Fix`
- Reason:
  Not a bug. Nested `setStoreBatch(...)` depth accounting and flush behavior are already correct for synchronous exceptions and promise-return rejection.

## Summary

### Must Fix

- Bug 10: async middleware can commit a `Promise`
- Bug 11: promise-backed async fetch can still write after abort
- Bug 15: sync ordering under skew/suspended peers is a real correctness weakness
- Bug 23: path writes block common `null -> object` initialization
- Bug 27: `createStoreForRequest.create(..., options)` accepts ignored options
- Bug 42: persisted load timestamps can mislead sync ordering

### Intentional

- Bug 1, 2, 6, 7, 8, 13, 16, 22, 29, 30, 32, 44, 46

### No Need to Fix

- Bug 3, 4, 5, 9, 12, 14, 17, 18, 19, 20, 21, 24, 25, 26, 28, 31, 33, 34, 35, 36, 37, 38, 39, 40, 41, 43, 45, 47

## Additional Edge Cases Review

These were reviewed from the later "25 Most Dangerous Edge Cases" and "Architectural Weak Points" list. Only items that materially change the current report are added here.

### Must Fix

#### Unversioned sync wire protocol

- Verdict: `Must Fix`
- Category: `Regression Risk`
- Where: [src/features/sync.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/sync.ts)
- Reason:
  Sync messages do not carry a protocol version or compatibility marker. Tabs running different Stroid builds will still talk to each other over the same `BroadcastChannel`, but there is no way to negotiate or reject incompatible payload formats.
- Why this matters:
  Once sync is treated as a real product feature, mixed-version tabs are normal during rolling deploys, cached assets, or long-lived sessions. Right now that scenario is relying on luck.

### Intentional

#### Side-effect feature registration can disappear if imports are removed

- Verdict: `Intentional`
- Category: `Architectural Tradeoff`
- Where:
  - [src/persist.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/persist.ts)
  - [src/sync.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/sync.ts)
  - [src/devtools.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/devtools.ts)
- Reason:
  The split package model deliberately relies on side-effect imports such as `import "stroid/persist";`. If those imports are removed or tree-shaken incorrectly, the feature is not registered.
- Note:
  This is not a runtime bug in the current implementation. It is the chosen package-contract model and must be documented very clearly.

#### Recursive subscriber updates can livelock the notification queue

- Verdict: `Intentional`
- Category: `Behavioral Risk`
- Where: [src/store.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store.ts)
- Reason:
  Reentrant `setStore(...)` from a subscriber does not recurse on the same stack frame because notifications are microtask-flushed, so the reported stack-overflow claim is overstated. But a subscriber that always writes again can still create an endless microtask chain.
- Note:
  This is a user-land logic loop, not a store corruption bug, but it deserves documentation as a sharp edge.

#### Hydrating old snapshots without options can create stores without expected features

- Verdict: `Intentional`
- Category: `API Contract`
- Where:
  - [src/store.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store.ts)
  - [src/server.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/server.ts)
- Reason:
  `hydrateStores(...)` creates missing stores using the options supplied to the hydrate call. If callers hydrate a snapshot without providing the needed per-store or `default` options, the created stores will not automatically regain persistence, sync, or other feature settings.
- Note:
  This is consistent with the current API, but it is easy to misunderstand and should be documented explicitly.

### No Need to Fix

#### Sync channel name collisions between different store names do not corrupt state

- Verdict: `No Need to Fix`
- Category: `False Positive`
- Where: [src/features/sync.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/sync.ts)
- Reason:
  Even when two stores share the same `BroadcastChannel`, incoming messages are still gated by `msg.name === name`. Different store names on the same channel create noise, not cross-store state corruption.

#### Devtools in production does not have unlimited history growth

- Verdict: `No Need to Fix`
- Category: `False Positive`
- Where:
  - [src/features/devtools.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/devtools.ts)
  - [src/adapters/options.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/adapters/options.ts)
- Reason:
  History is capped by `historyLimit`, which defaults to `50`, and `historyLimit: 0` disables retention entirely. The "gigabytes over hours due to unlimited history" claim does not match the current runtime.

#### Cyclic state does not silently reach persistence or sync

- Verdict: `No Need to Fix`
- Category: `False Positive`
- Where:
  - [src/store.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store.ts)
  - [src/utils.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/utils.ts)
- Reason:
  `sanitize(...)` rejects circular input before the state is committed. That means cyclic data is blocked at write time rather than silently failing later during persistence or sync serialization.

#### Warning-suppression sets are not a meaningful remaining test-isolation risk

- Verdict: `No Need to Fix`
- Category: `Low-value Hardening`
- Where:
  - [src/async.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/async.ts)
  - [src/hooks-core.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/hooks-core.ts)
  - [src/testing.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/testing.ts)
- Reason:
  `_noSignalWarned` is already reset by test helpers. `_broadUseStoreWarnings` is still process-global, but it is a tiny warning-suppression set and not a practical source of flaky runtime correctness. This is cleanup polish, not a bug worth promoting into the must-fix set.

## Third Audit Screen (Bugs 48-103)

This batch was screened against the current source. Most of it was either duplicating earlier issues, overstating current behavior, or describing deliberate tradeoffs. Only the items below materially change the report.

### Must Fix

#### Bug 56 / Bug 57 - stale aborted async work can overwrite newer success

- Verdict: `Must Fix`
- Where: [src/async.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/async.ts)
- Reason:
  `_settleAbort(name)` writes `{ status: "aborted" }` through `setStore(...)` with no request-version guard. If request A is aborted after request B already succeeded for the same store, the late abort path from A can overwrite B's success state.
- Note:
  This is distinct from Bug 11. Bug 11 was about promise-backed requests still applying after abort. This one is about stale abort settlement corrupting a newer successful state.

#### Bug 59 - middleware can mutate `ctx.next` after validation has already run

- Verdict: `Must Fix`
- Where:
  - [src/features/lifecycle.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/lifecycle.ts)
  - [src/store.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store.ts)
- Reason:
  `schema`, `validator`, and `sanitize` run before middleware. Middleware receives a live mutable `next` reference. If a middleware mutates `ctx.next` in place and returns `undefined`, that mutated object is committed without a second sanitize/schema/validator pass.
- Why this matters:
  A middleware can inject shape changes, invalid values, or even objects the earlier validation step would have rejected.

#### Bug 87 - `onMigrationFail: "keep"` can preserve a partially migrated invalid state

- Verdict: `Must Fix`
- Where: [src/features/persist.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/persist.ts)
- Reason:
  During version-step migration, if an early migration succeeds and a later one fails, `resolveMigrationFailure(...)` receives the already-mutated intermediate `parsed` value. With `"keep"`, it returns that partial state with `requiresValidation: false`, so it can be committed without any schema re-check.
- Why this matters:
  A target-version store can start running with a partially migrated older shape while metadata still assumes the latest version.

#### Bug 89 - `useFormStore` writes `"on"` for checkbox inputs

- Verdict: `Must Fix`
- Where: [src/hooks-form.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/hooks-form.ts)
- Reason:
  `useFormStore` always reads `e.target.value`. For checkboxes, the meaningful signal is `e.target.checked`, not `"on"`.

#### Bug 92 - delete subscribers can still write to a store before deletion completes

- Verdict: `Must Fix`
- Where:
  - [src/internals/store-admin.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/internals/store-admin.ts)
  - [src/store.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store.ts)
- Reason:
  `deleteExistingStore(...)` notifies subscribers with `null` before registry deletion. During that window, a subscriber can call `setStore(name, ...)`, and `_exists(name)` still returns true. The write lands, then the store is deleted immediately afterward, so the write is silently lost.

#### Bug 96 - sync tie-breaker uses locale-sensitive string comparison

- Verdict: `Must Fix`
- Where: [src/features/sync.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/sync.ts)
- Reason:
  `compareSyncOrder(...)` uses `incomingSource.localeCompare(localSource)` without a fixed locale or a simple bytewise comparison. That makes the final tiebreaker locale-sensitive across environments.
- Why this matters:
  Sync ordering must be deterministic across peers. Locale-dependent ordering is the wrong primitive for protocol ordering.

### Intentional

#### Bug 50 - single-store subscriber flush is synchronous and can block under extreme load

- Verdict: `Intentional`
- Where: [src/store.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store.ts)
- Reason:
  `_scheduleFlush()` runs subscribers for a store in one synchronous pass. That is a scale limit and a known performance tradeoff, not a hidden bug in the current architecture.

#### Bug 51 / Bug 81 - `createStore(...)` returns `{ name }` when the store already exists

- Verdict: `Intentional`
- Where: [src/store.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store.ts)
- Reason:
  This is the current API contract. It is footgun-prone, but it is not accidental behavior.

#### Bug 54 - shallow object merge replacing nested subtrees

- Verdict: `Intentional`
- Where: [src/store.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store.ts)
- Reason:
  `setStore(name, partialObject)` is a shallow merge API. Replacing nested branches is part of that contract.

### No Need to Fix

#### Bug 48 - unsubscribe during flush does not skip later subscribers

- Verdict: `No Need to Fix`
- Where: [src/store.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store.ts)
- Reason:
  The claim is backwards for the current implementation. Flush captures the current array reference in `subs`, and unsubscribe replaces `_subscribers[name]` with a new sliced array. That means the current flush continues over the old array reference; it does not skip later subscribers in that pass.

#### Bug 49 / Bug 54 - stale snapshots/selectors after in-place mutation are not a public-API bug

- Verdict: `No Need to Fix`
- Where:
  - [src/store.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store.ts)
  - [src/selectors.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/selectors.ts)
- Reason:
  The described stale-cache scenario depends on in-place mutation of committed store state. Public write paths create new roots or clones before commit. Middleware mutating `ctx.next` is a separate real bug (Bug 59), but the specific `_getSnapshot` stale-cache claim is not the primary failure mode.

#### Bug 52 - direct Promise input abort behavior is already covered

- Verdict: `No Need to Fix`
- Reason:
  This is effectively the same underlying issue as Bug 11, not a separate bug class.

#### Bug 53 - persisted load timestamp problem is already covered

- Verdict: `No Need to Fix`
- Reason:
  This is the same core issue as Bug 42.

#### Bug 55 - deep clone recursion fallback is already covered

- Verdict: `No Need to Fix`
- Reason:
  This is the same pathological-depth fallback issue already captured by Bug 3.

## Fourth Audit Screen (Bugs 104-110)

### Must Fix

#### Bug 107 - mutator recipe throws bypass `onError` and warning flow

- Verdict: `Must Fix`
- Where:
  - [src/store.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store.ts)
  - [src/utils.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/utils.ts)
- Reason:
  In the mutator branch, `produceClone(...)` can throw and `setStore(...)` does not catch that error. The exception escapes directly to the caller, and Stroid does not route it through `onError` or its own warning/reporting path.
- Why this matters:
  Other invalid write paths are generally reported through the store error channel. The mutator path currently behaves differently and more violently.

#### Bug 108 - incoming sync data bypasses sanitize/validator safeguards

- Verdict: `Must Fix`
- Where: [src/features/sync.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/sync.ts)
- Reason:
  Incoming sync state is schema-checked, but it is not passed through `sanitize(...)` and it does not go through the normal validator path before `setStoreValue(...)`.
- Why this matters:
  Sync becomes an alternate write channel with weaker guarantees than `setStore(...)`. Even if `BroadcastChannel` blocks functions, other non-normalized values such as `Date`, `Map`, `Set`, or cyclic structures can bypass the normal store write contract when no schema is configured.

#### Bug 110 - deduped async callers silently inherit the first caller's transform

- Verdict: `Must Fix`
- Where: [src/async.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/async.ts)
- Reason:
  Deduplication is keyed only by `cacheSlot`. If two callers share the same slot but pass different `transform` functions, the second caller receives the first caller's transformed result because `_inflight[cacheSlot]` returns the original promise unchanged.
- Why this matters:
  That is silent data-shape corruption at the call boundary, not just a documentation issue.

### Intentional

#### Bug 104 - `refetchStore(...)` stops working after delete and recreate unless a new fetch definition is registered

- Verdict: `Intentional`
- Where: [src/async.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/async.ts)
- Reason:
  Deleting a store intentionally clears its async metadata, including `_fetchRegistry[name]`. After recreation, `refetchStore(name)` has no remembered request definition until `fetchStore(...)` is called again.
- Note:
  This is consistent teardown behavior, not a leak or hidden corruption bug. It should be documented clearly.

### No Need to Fix

#### Bug 105 - migration returning `undefined` does not lose in-place mutations

- Verdict: `No Need to Fix`
- Where: [src/features/persist.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/persist.ts)
- Reason:
  The claim is inaccurate. `parsed` is an object reference. If a migration mutates that object in place and returns `undefined`, the mutation has already happened and remains in `parsed`.

#### Bug 106 - subscriber added during flush is not called in the same pass

- Verdict: `No Need to Fix`
- Where: [src/store.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store.ts)
- Reason:
  Although `_subscribe(...)` pushes into the current subscriber array, `Array.prototype.forEach(...)` uses the array length captured at iteration start. A new subscriber appended during the flush does not run in that same pass.

#### Bug 109 - dynamic path changes in `useStore(...)` are not a demonstrated tearing bug

- Verdict: `No Need to Fix`
- Where: [src/hooks-core.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/hooks-core.ts)
- Reason:
  This is speculative and not strongly supported by the current hook structure. `useSyncExternalStore(...)` is specifically designed to handle changing subscribe/getSnapshot functions across renders. There is not enough evidence here to promote this into a real bug.
