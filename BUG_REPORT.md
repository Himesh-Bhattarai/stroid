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

## Recent Fixes (March 10, 2026)

| Item | Status | Notes |
| --- | --- | --- |
| refetchStore Promise replay | Fixed | Promise inputs are one-shot; refetch requires a URL or factory. |
| Single-pass validation | Fixed | Sanitize before middleware; schema/validator only after. |
| Selector first-call double-fire | Fixed | Listener waits for first real change. |
| Async state registry scoping | Fixed | Async metadata keyed per registry scope. |
| Batch async notification leak | Fixed | Pending notifications restored on async callback. |
| JSON fallback in selectors | Removed | Equality now purely user-supplied. |
| Sync locale tiebreaker | Fixed | Uses localeCompare with explicit locale. |
| Configurable refocus throttle | Added | Debounce/maxConcurrent/stagger with per-call overrides. |
| Validator critical logging | Fixed | Validator failures surface through critical sink. |
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



# MUST FIX 
PHASE 2 — Worst scores by category:

Security (4/10): setByPath doesn't apply the FORBIDDEN_OBJECT_KEYS protection that deepClone does. Prototype pollution surface exists. Sync messages from same-origin scripts are trusted implicitly.
Reliability (5/10): Validator runs twice per write (pre + post middleware). setStoreBatch fires notifications before throwing on async detection.
Scalability (5/10): 500 notified stores get processed synchronously in one microtask — no chunking. Sync payload silently drops in production with zero observable signal.


PHASE 8 — TOP 10 PRODUCTION BUGS:

CRITICAL: refetchStore with a Promise input re-awaits the already-settled Promise → instant stale result, zero network activity, looks like a refetch
HIGH: Every write double-validates (schema + validator runs twice — pre-middleware and post-middleware)
HIGH: warn() is a no-op in production — critical events like "sync payload dropped" are completely silent
HIGH: subscribeWithSelector calls the listener on first notification even when nothing changed
HIGH: async.ts module-level state is NOT scoped to the store registry — bleeds across registry instances
MEDIUM: setStoreBatch fires subscriber notifications before throwing when it detects an async function
MEDIUM: enableRevalidateOnFocus() triggers ALL registered fetches simultaneously on tab focus — no debounce
MEDIUM: Async guard in setStoreBatch checks constructor.name === "AsyncFunction" — bypassable
MEDIUM: serializedSelectorEqual is an unbounded JSON.stringify comparison in every notification cycle
LOW: import.meta.url registry scoping breaks in bundlers that inline or rename modules



1. Simplicity and Clarity — Score: 7/10
Strengths:

Public API is clean and minimal: createStore, setStore, getStore, deleteStore, resetStore, mergeStore — excellent ergonomics for the happy path.
Internal naming (_stores, _subscribers, _initial, _meta) is consistent and clear.
Feature opt-in via side-effect import is clever and keeps bundle sizes honest.

Weaknesses:

store.ts is 814 lines and does too much: path validation, sanitization, middleware orchestration, schema validation, feature hook coordination, SSR detection. This is a god file masquerading as a module.
async.ts is 637 lines and also does too many things: fetching, caching, retry, revalidation, store auto-creation, signal management, cleanup subscription wiring. All in one file.
The internal _hardResetAllStoresForTest function is exported directly from store.ts with an underscore convention but has no access control. Any code importing from src/store.ts directly (as the tests do) can call it.
There are two parallel documentation systems (docs/ with 24 chapters and docs_2.0/ with a book-style structure). This is maintenance debt masquerading as thoroughness.

Risks:

As the codebase grows, the store.ts god file will become a merge conflict magnet and cognitive load nightmare.

Improvement:

Extract middleware execution, path validation, and sanitization into separate files. The 800-line file should be under 300.




2. Reliability and Consistency — Score: 5/10
Strengths:

Synchronous writes always produce a notification on the microtask queue — no missed updates.
setStoreBatch correctly prevents subscriber storms.
produceClone (immer-like draft mutation) is isolated and safe.

Weaknesses:

Validator runs TWICE per write (see Bug #4 in Phase 8). This is a real correctness and performance issue.
refetchStore with a Promise input is broken (see Bug #1 in Phase 8). It re-awaits the original, already-settled Promise, which resolves instantly with stale data.
No write atomicity across multiple stores. setStoreBatch batches notifications but does not roll back on partial failure.
_batchDepth is a module-level integer. If middleware throws inside a batch, _batchDepth can never decrement (actually it does via finally — but only for direct calls, not nested async scenarios, which setStoreBatch now explicitly rejects).

Risks:

Reliability depends on users calling features in the right import order and understanding that async module-level state is not cleaned up per-registry.


3. Usability — Score: 7/10
Strengths:

The setStore("user", "profile.name", "Jordan") dotted path API is excellent DX.
Error messages have suggestions: Levenshtein-based store name typo detection is a genuine delight.
fetchStore handling of content-type auto-detect (JSON vs text) is thoughtful.
useStore with inline selectors is ergonomic and modern.

Weaknesses:

subscribeWithSelector's listener is called immediately on first notification if the subscriber was registered before the store existed. This surprises users who expect "call only on change."
null is used as the "store not found" sentinel for getStore, but also as a valid store value. getStore("name") returning null could mean "store doesn't exist" or "the store contains null." There is no way to distinguish these at the call site.
The index.d.ts file in the root is a manually-maintained type shim that duplicates definitions from adapters/options.ts. These will drift.
mergeStore silently does nothing when called on non-object stores. It should throw or return a result.


4. Flexibility and Adaptability — Score: 7/10
Strengths:

The feature plugin system (registerStoreFeature) allows first-party and theoretically third-party features.
Schema validation supports Zod, Yup, Valibot, and custom functions via duck-typing — genuinely flexible.
Custom persist drivers, custom serializers, custom conflict resolvers for sync — well-designed escape hatches.

Weaknesses:

The feature registry is global (module-level _featureFactories Map). There is no way to have different features registered in different scopes or test environments. You register globally and clear globally.
No plugin lifecycle for "before feature registration" or "feature conflict resolution." If registerStoreFeature("persist", factory) is called twice, the second silently overwrites.
The StoreOptions type has both validate AND validator AND schema — three overlapping validation entry points. The options adapter normalizes these, but the surface is confusing.


Scalability — Score: 5/10
Strengths:

Microtask-batched notifications prevent synchronous re-render cascades.
createSelector with Proxy-based dependency tracking is efficient for derived state.
subscribeWithSelector equality comparison avoids redundant re-renders.

Weaknesses:

All stores live in a single flat namespace (_stores as Record<string, StoreValue>). There is no namespacing, no store grouping, no lazy initialization. At 1,000+ stores, subscriber management and store-listing become O(n) across the entire namespace.
_pendingNotifications is a Set<string> — bounded, correct. But the flusher iterates the entire set synchronously: if 500 stores are notified in a batch, 500 subscriber arrays are iterated in a single microtask. No chunking, no priority.
The sync BroadcastChannel approach broadcasts raw state. At large state sizes, this will exceed the maxPayloadBytes limit and silently drop updates with a warn() that most users won't see in production (since warn is a no-op in production).

Risk: silent sync drops in production. The maxPayloadBytes guard logs a warning — but warn is silenced in production. Users will have cross-tab divergence with no observable signal.


6. Low Redundancy — Score: 5/10
Weaknesses:

_normalizeCommittedState is called twice in setStore, mergeStore, and _replaceStoreState. The first call runs sanitize + schema + validator; then middleware runs; then the same three checks run again. Every write validates twice.
deepClone is implemented three ways: structuredClone fast path, JSON.parse(JSON.stringify(...)) fallback, and a full manual recursive fallback _deepCloneFallback. This is reasonable defensively, but the three fallbacks add to test surface.
shallowEqual is defined independently in utils.ts AND in hooks-core.ts. Two implementations, neither referencing the other.
The two documentation systems (docs/ and docs_2.0/) are pure redundancy. Combined documentation surface: 39 markdown files covering the same API.

7. High Cohesion, Loose Coupling — Score: 6/10
Strengths:

The feature registry cleanly decouples store.ts from knowing about persist/sync/devtools. Features register themselves.
selector-store.ts cleverly resolves to the parent registry by constructing a relative URL from import.meta.url, keeping selectors coupled to the correct registry without importing from store.ts.

Weaknesses:

async.ts imports _subscribe directly from store.ts — a private internal function. This is a layer violation: the async module bypasses the public API to wire up its store cleanup subscription.
store-admin.ts reconstructs nearly the same context object that store.ts builds via _createBaseFeatureContext. Code duplication between deletion context and creation context is a cohesion failure.
hooks-core.ts imports both _subscribe and _getSnapshot — two private internals — from store.ts. The hooks layer shouldn't need to know about internal subscription mechanics.


Strengths:

Immutable dev-mode freezing via devDeepFreeze with iterative (not recursive) implementation — correctly handles deep nesting and circular refs without stack overflow.
Snapshot cache (_snapshotCache) using source reference equality avoids unnecessary deep clones for reads.
_requestVersion counter for async requests prevents stale writes from older fetches — correct last-write-wins implementation.

Weaknesses:

Module-level state in async.ts (8 separate module-level objects) is not scoped to the same registry as stores. Stores can be per-registry, but async metadata is always global-per-module. If you have multiple store registries (edge case but valid), async state bleeds across them.
No transactional semantics for setStoreBatch: notifications are batched but state writes are not. If an exception occurs mid-batch, some stores are updated and some are not. No rollback.
The _initial deep clone on createStore means large initial states get cloned immediately and held in memory forever, even if resetStore is never called.


Robust Security — Score: 4/10
Weaknesses:

FORBIDDEN_OBJECT_KEYS in utils.ts blocks __proto__, constructor, prototype during cloning. This is good. But it is NOT applied in setByPath (the path-based setter). A user could call setStore("s", "__proto__.polluted", true) and potentially achieve prototype pollution. The _validatePathSafety function checks if the path exists using hasOwnProperty — which would return false for __proto__ on a plain object, so the write would be rejected. However, this protection depends on hasOwnProperty behavior which is fragile.
Persist encryption: the encrypt/decrypt interface is required but trivially passable as identity functions ((v) => v). There is no enforcement, no warning for plaintext storage of sensitive data.
schema and validator options are typed as unknown: no runtime type guard on the schema object before calling duck-typed methods on it. A malformed schema silently passes (falls through to { ok: true }).
No CSRF/origin checks on sync messages: BroadcastChannel messages from the same origin are trusted implicitly. A malicious page script in the same origin could broadcast forged state to all tabs.
The index.d.ts root-level type file exposes any in multiple places: StorageLike has [key: string]: any.

 Efficiency — Score: 6/10
Strengths:

structuredClone fast path for deep cloning — correct and modern.
Proxy-based selector dependency tracking only runs once, then uses reference equality for subsequent updates.
CRC32 hash for devtools state history deduplication — reasonable.

Weaknesses:

Every getStore call deep-clones the data, even for read-only usage. There is useStoreStatic for no-clone reads in React, but no equivalent for non-React consumers.
_scheduleFlush re-schedules itself if _pendingNotifications.size > 0 after flushing. In a heavy write scenario, this creates a chain of microtask flushes rather than a single deferred batch. This can delay React rendering.
notifyCount and timing metrics are computed inside every subscriber notification loop, adding overhead per-store per-notification.
The _validatePathSafety function traverses the full path on every write. For deeply nested paths, this is O(depth) object traversal before the actual write.

Observability — Score: 7/10
Strengths:

Per-store metrics: notifyCount, totalNotifyMs, lastNotifyMs, updateCount — genuinely useful.
Devtools integration with Redux DevTools, history with configurable limit, redaction support.
getAsyncMetrics() for cache hits/misses/dedupes/avg response time.
listStores(), getStoreMeta(), getInitialState() in runtime-tools.ts for introspection.
All warn/error/log are no-ops in production — correct behavior (no console noise in prod).

Weaknesses:

warn and error are silent in production. Several critical errors (sync payload dropped, schema mismatch, invalid path) fire warn() which is a no-op in production. Users have no production signal that their sync is silently dropping updates. This is the observability equivalent of a smoke alarm that only works when you're watching.
No structured logging interface. Everything goes through console.warn/error/log. No log level abstraction that users could pipe to their own observability stack.
Metrics are not exported to any external format. There is no way to push them to Prometheus, Datadog, etc.

Well-Integrated — Score: 6/10
Strengths:

React 18 useSyncExternalStore — correct modern integration, not a janky useEffect subscription.
SSR guard with createStoreForRequest is correct in concept.
hydrateStores for server snapshot injection.

Weaknesses:

No Next.js app router integration pattern. The SSR story requires manual createStoreForRequest per-request but there are no examples of middleware integration or RSC compatibility.
No SolidJS, Svelte, or Vue bindings — currently React-only for UI frameworks.
No Suspense integration for async stores. fetchStore sets loading: true but there is no React Suspense bridge.

. Goal-Oriented Design — Score: 7/10
The library knows what it wants to be: a simple, observable, production-hardened state manager that doesn't require Redux ceremony. This goal is clear throughout the API design and documentation. The challenge is that the execution has not yet caught up with the ambition.

 Feedback Loops — Score: 5/10
Strengths:

Dev-mode warnings are rich and actionable (typo suggestions, path validation errors, type mismatch messages).
onError callback on every store gives users a structured error surface.

Weaknesses:

No test coverage reporting in CI. The GitHub Actions workflow only validates commit message formats — it does not run tests. There is zero automated test feedback on pull requests.
No changelog automation. CHANGELOG.md is hand-written.
The STATUS.MD file has a custom commit format enforced by CI (STATUS(code): message) — this is invented process overhead with no clear benefit.

 Continuous Improvement — Score: 5/10
A v0.0.5 library with a 24-chapter documentation set, a secondary docs_2.0/ book-structure, benchmark scripts, and a custom status commit workflow has invested heavily in presentation. The concern is that process and documentation are growing faster than the core correctness. The bugs identified in this audit are not exotic edge cases — they are fundamentals (double validation, stale refetch, no CI).

 Documentation — Score: 8/10
Strengths:

The documentation is unusually thorough for a v0.0.5 library.
Real-world patterns, migration guides, SSR section, testing guide, architecture deep-dive.
docs_2.0/ has a "BUG_AS_HELPER" section that intentionally documents known quirks — an interesting approach.

Weaknesses:

Two parallel documentation systems (docs/ and docs_2.0/) will drift and contradict each other.
The index.d.ts root-level type file has inconsistencies with the actual source types in adapters/options.ts (e.g., StoreOptions in the root types uses validate?: unknown while the source has both validate and validator).
No auto-generated API reference from TSDoc comments. The source has no JSDoc. All documentation is hand-maintained

 Fail Gracefully — Score: 6/10
Strengths:

Persist errors are caught and routed to onError — state updates still apply.
Middleware throws don't propagate to callers.
devDeepFreeze handles circular references without crashing.

Weaknesses:

setStoreBatch throws synchronously if it detects a promise return — but by then, it has already flushed pending notifications (see the code path: if result.then is a function AND _pendingNotifications.size > 0, it calls _scheduleFlush() THEN throws). Notifications fire before the throw is caught.
Schema validation failure silently blocks the write with no way for the caller to distinguish "store not found" from "schema rejected." setStore returns void — callers get no feedback.
When createStore is blocked in production SSR, it returns undefined. The caller gets undefined silently unless they passed onError. In a TypeScript strict context this is caught, but in JavaScript it's a silent no-op.

 registration if the subscriber wasn't present at registration time. This is a surprise behavior not reflected in the API name.
deepClone uses structuredClone when available but silently falls back to JSON.parse(JSON.stringify(...)) which drops functions, Dates become strings, undefined becomes null. Users storing Date objects in stores will have them silently serialized to ISO strings across certain environments.

PHASE 3 — TYPE SYSTEM & DEVELOPER EXPERIENCE
Strong Type Inference — Score: 8/10
createStore("user", { name: "Alex", age: 25 }) returns StoreDefinition<"user", { name: string; age: number }>. getStore(userDef) returns { name: string; age: number } | null. setStore(userDef, "profile.name", "value") is type-checked via the Path<T> and PathValue<T, P> generic system.
The Path<T, Depth> type is a recursive string literal union with depth-limiting. This is genuinely impressive TypeScript. At depth 6 (default), deeply nested object access is type-safe with autocomplete.
Footgun: The PathValue<T, P> system returns never for invalid paths — which TypeScript will reject at compile time. But setStore(name: string, path: string, value: unknown) is still callable with plain strings, bypassing type safety entirely. The typed overloads only apply when using StoreDefinition.

Strict Mode Support — Score: 7/10
tsconfig.json has strict: true and noImplicitAny: true. The source compiles cleanly under strict mode. However, there are multiple as any casts in features/persist.ts, features/sync.ts, and adapters/options.ts — mostly around migration function arguments.

API Ergonomics — Score: 7/10
Good: Mutator function API (setStore(name, draft => { draft.count++ })) is Immer-like without the Immer dependency.
Bad: The overloaded setStore signature has 6 overloads. IDEs show all 6 when hovering, which is noisy.
Bad: null as the "not found" sentinel is confusing. A Result<T> or Option<T> type would be cleaner.
Bad: useStore accepts both a path string AND a selector function — these have different semantics but the same function signature. This creates an unstable API.
Hidden Footguns

getStore returns null for both "store not found" and "store value is null" — undetectable without hasStore check.
setStore(name, partialObject) does shallow merge — silently drops nested updates.
deepClone in non-structuredClone environments silently converts Dates to ISO strings.
refetchStore with a Promise-based fetchStore call immediately resolves with old data.

Architectural Consistency — Score: 6/10
There are two distinct architectural patterns coexisting: the registry-scoped store system (where each module URL gets its own registry) and the globally-singleton async state (where _fetchRegistry, _inflight, _cacheMeta are module-level globals not tied to any registry). These two patterns are in fundamental tension. When you delete a store, the store registry entry is removed but the async metadata cleanup relies on a subscription to the (now-deleted) store's null notification — a fragile, order-dependent cleanup chain.

Architectural Consistency — Score: 6/10
There are two distinct architectural patterns coexisting: the registry-scoped store system (where each module URL gets its own registry) and the globally-singleton async state (where _fetchRegistry, _inflight, _cacheMeta are module-level globals not tied to any registry). These two patterns are in fundamental tension. When you delete a store, the store registry entry is removed but the async metadata cleanup relies on a subscription to the (now-deleted) store's null notification — a fragile, order-dependent cleanup chain.
Separation of Concerns — Score: 5/10
store.ts is a god module:

Input validation
Schema validation
Sanitization
SSR detection
Path traversal
Middleware orchestration
Feature hook coordination
Notification batching
Snapshot caching

These are 8+ distinct concerns in one file.
Dependency Direction — Score: 6/10
async.ts → store.ts (imports private _subscribe) — layer violation.
hooks-core.ts → store.ts (imports private _subscribe, _getSnapshot) — layer violation.
selector-store.ts uses URL construction to resolve the parent registry — clever but fragile if the file is moved.
Modular Boundaries — Score: 6/10
The feature plugin system is well-designed. But the boundaries break down when features need private store internals. The BaseFeatureContext passed to features includes setStoreValue, applyFeatureState, notify — these are store internals exposed via context rather than a proper internal API. It works, but it's an inversion of the intended isolation.


PHASE 5 — PRACTICAL FUNCTIONALITY
Runtime Validation
Path safety validation is thorough — checks array bounds, type consistency, object existence. Schema validation supports major validation libraries. Good.
Edge Case Handling

Circular references in deepClone: handled via WeakMap seen-cache.
devDeepFreeze uses iterative BFS to avoid stack overflow on deep objects.
SSR production guard prevents global store creation.
Concurrent async requests: last-write-wins via _requestVersion counters.

Error Boundaries
setStore returns void. All errors are swallowed internally and routed to onError or warn. There is no way for callers to know if their write succeeded. This is intentional (resilience) but means silent state divergence.
Backward Compatibility
normalizeStoreOptions maps legacy option names (allowSSRGlobalStore, schema, validator) to new names and emits deprecation warnings. The collectLegacyOptionDeprecationWarnings pattern is correct.
Migration Strategy
Version-based migration in persist is supported: migrations: { 1: (state) => ({...}) }. Migration failures have three resolution strategies: "reset", "keep", or a custom function. Well-designed.
Code Churn Rate
Based on the CHANGELOG, this project has had 5 versions across 3 days (0.0.1 through 0.0.5 in the span of roughly March 4–9, 2026). This is extremely high churn. The debug-test/splitting-ev branch is adding new tests rapidly, suggesting the core is still being stabilized. Do not pin to this version in production — it will change significantly.


PHASE 6 — COMMUNITY HEALTH
Bus Factor: 1
Single author repository (Himesh-Bhattarai). No co-maintainers visible. GitHub workflows enforce a custom commit format (STATUS(code): message) that signals a very personal development workflow not designed for external contributors.
Contributor Friendliness: 4/10

CONTRIBUTING.md exists.
CODE_OF_CONDUCT.md exists.
PR template exists.
Issue templates exist.

However: no CI that runs tests (only validates commit formats), custom commit message convention with no external standard, no CODEOWNERS file, no discussion of contribution guidelines beyond "be nice."


DevTools Support — Score: 7/10
Redux DevTools integration via BroadcastChannel-based devtools API. History with configurable limit, redaction support. Time-travel via clearHistory. Solid foundation.
Gap: There is no browser extension integration beyond what Redux DevTools already provides. No stroid-specific devtools panel.


Framework Compatibility

React 18+: ✅ First-class via useSyncExternalStore
React 19: ✅ (test renderer is v19)
Next.js (Pages Router): Partial — SSR guard works but no automatic request scope injection
Next.js (App Router / RSC): ❌ No documented pattern; RSC cannot use hooks
Vue / Svelte / SolidJS: ❌ No bindings
Node.js: ✅ Core store works; React hooks don't apply


Ecosystem Readiness — Score: 5/10
The package has correct exports in package.json with 14 named subpath exports, ESM-only build with tsup, tree-shakeable with sideEffects declarations for feature registration imports. The build configuration is correct and modern.
Gap: No CJS build. Some legacy bundlers and Jest configurations will fail with ESM-only packages.

PHASE 8 — FAILURE ANALYSIS: TOP 10 PRODUCTION ISSUES
Bug #1 — CRITICAL: refetchStore with Promise Inputs Is Permanently Broken
Where: src/async.ts lines 528, 533–541
What: _fetchRegistry[name] stores the original urlOrPromise. When refetchStore calls fetchStore(name, last.url, last.options) and last.url is a Promise that has already settled, await urlOrPromise resolves instantly with the original data. The "refetch" returns stale cached data with zero network activity. The user calls refetchStore expecting a fresh fetch and gets the original result silently.
Fix: Store whether the original input was a Promise. If it was, either disallow refetchStore for Promise-based fetches or require a factory function () => Promise<T> instead of a raw Promise.
typescript// Current broken state:
const p = fetch("/api/data").then(r => r.json());
await fetchStore("data", p);  // works
await refetchStore("data");   // re-awaits settled promise = instant stale result
Bug #2 — HIGH: Double Validation on Every Write
Where: src/store.ts — setStore, mergeStore, _replaceStoreState
What: _normalizeCommittedState (which runs sanitize + schema + validator) is called TWICE per write: once before middleware, once after. A validator function is called with the pre-middleware value AND the post-middleware value. For expensive validators (e.g., Zod parse of a large object), this doubles the cost. For stateful validators (e.g., tracking call counts), this causes unexpected behavior.
Fix: Only call _normalizeCommittedState post-middleware. Pre-middleware, only sanitize. Schema and validator should run once on the final committed value.
Bug #3 — HIGH: warn() is Silent in Production — Critical Errors Are Hidden
Where: src/features/sync.ts, src/async.ts, src/store.ts
What: Multiple genuinely critical conditions (sync payload dropped due to maxPayloadBytes, invalid path writes, schema failures) emit warn() which is () => {} in production. Users in production have no signal that their cross-tab sync is silently dropping messages, or that their path writes are being rejected.
Fix: Introduce two log levels: warn (dev-only) and critical (always fires, routes to onError only). Critical conditions that silently break user expectations should always surface via onError.
Bug #4 — HIGH: subscribeWithSelector Calls Listener on First Update Even Without Change
Where: src/selectors.ts lines 105–109
What: When a subscriber registers before the store exists and then the store is created, hasPrev is false at first notification time. The code path calls listener(deepClone(nextSel), deepClone(nextSel)) — passing identical prev and next. This fires the listener even though nothing changed. React components using subscribeWithSelector as their subscription mechanism will see a spurious re-render on store creation.
Fix: On first notification, set prevSel = nextSel; hasPrev = true without calling the listener.
Bug #5 — HIGH: Async Module State Is Not Registry-Scoped
Where: src/async.ts — module-level _fetchRegistry, _inflight, _requestVersion, _cacheMeta, _cleanupSubs, _storeCleanupFns, _revalidateHandlers, _noSignalWarned
What: These 8 data structures are module-level singletons. The store system supports multiple registries scoped by import.meta.url. But async state is always global. In environments where store.ts might be loaded at multiple URLs (e.g., Vite HMR creating new module instances), async state bleeds across registry instances, causing phantom cleanup subscriptions and stale request cancellations.
Fix: Scope async state to a key derived from the store registry URL, the same way getStoreRegistry works.
Bug #6 — MEDIUM: setStoreBatch Fires Notifications BEFORE Throwing on Async Detection
Where: src/store.ts lines 637–647
What: If fn() returns a Promise (async function), setStoreBatch correctly throws. But before throwing, it calls _scheduleFlush() if there are pending notifications. This means subscribers fire for partial batch state before the caller receives the error. The batch is semantically abandoned, but notifications already escaped.
Fix: Capture the pending notification set before calling fn(). If fn returns a Promise, restore the set and skip flushing before throwing.
Bug #7 — MEDIUM: refetchStore on "*" via enableRevalidateOnFocus Triggers All Stores
Where: src/async.ts line 556
What: enableRevalidateOnFocus() (no argument) registers a window.focus handler that calls refetchStore for every key in _fetchRegistry. On a tab focus event, every registered fetchStore call fires. In an app with 20 fetchStore registrations, a tab focus triggers 20 concurrent network requests simultaneously. No debouncing, no throttling, no configurable delay.
Fix: Add a minimum debounce (e.g., 500ms), expose a debounce option, and cap simultaneous revalidations.
Bug #8 — MEDIUM: _setStoreBatch Async Function Guard Is Bypassable
Where: src/store.ts line 630
What: The guard if (fn.constructor?.name === "AsyncFunction") can be bypassed by passing a regular function that returns a Promise (function myFn() { return Promise.resolve(); }). This function passes the guard, the batch starts, fn() returns a Promise, the Promise check runs and throws — but at this point _batchDepth has been incremented and the finally block decrements it correctly. This is mostly safe due to the finally block, but the guard is misleading: it claims to detect async functions but doesn't.
Fix: The try/finally pattern is already correct. Remove the constructor.name === "AsyncFunction" pre-check since the post-execution result.then check is more reliable.
Bug #9 — LOW/MEDIUM: serializedSelectorEqual as Fallback Is Unbounded
Where: src/selectors.ts lines 82–86
What: subscribeWithSelector uses JSON.stringify(next) === JSON.stringify(prev) as a fallback equality check for object values when Object.is fails. For large state objects, this is an O(n) string comparison on every notification. For very large or deeply nested state, this blocks the microtask queue. No size limit or timeout.
Fix: Remove the JSON fallback. Object.is failing means the values are genuinely different objects — accept the re-render. The JSON fallback is a correctness crutch that trades performance for avoiding spurious re-renders.
Bug #10 — LOW: import.meta.url Registry Scoping Will Break in Certain Bundler Configurations
Where: src/store.ts line 95, src/internals/selector-store.ts line 3
What: The registry scope key is derived from import.meta.url. In production builds where tsup (or another bundler) merges or inlines modules, import.meta.url may return the bundle entry URL rather than the original module URL. Two modules that should have different scopes will get the same scope. Additionally, selector-store.ts uses new URL("../store.js", import.meta.url).href to resolve the parent registry — this URL construction will produce different results depending on whether the build uses relative paths or absolute paths.
Fix: Make the registry scope explicitly configurable via a build-time variable (STROID_REGISTRY_ID) rather than relying on import.meta.url.


TESTING & QUALITY ASSURANCE
Test Structure — Score: 7/10
11 test files, 7,062 lines of test code total. Tests are organized by feature:

store.test.ts (1,550 lines) — core store operations
async.test.ts (686 lines) — fetchStore, caching, retry
persist.test.ts (594 lines) — persistence lifecycle
sync.test.ts (603 lines) — cross-tab sync
react-hooks.test.tsx (431 lines) — React bindings

No separation of unit/integration/e2e. All tests are effectively integration tests against real modules. Tests import directly from src/ not from dist/ — which means the published build is never tested.
Test Coverage — Score: 6/10
Coverage is strong for happy paths and explicitly documented edge cases. The test suite covers:

✅ Schema enforcement
✅ Persist save/load/migration/failure
✅ Async dedupe and last-write-wins
✅ React hook re-render counts
✅ SSR production block
✅ Batch notifications
✅ Sync BroadcastChannel (mocked)

NOT tested:

❌ The refetchStore + Promise input stale data bug (Bug #1)
❌ Double validation behavior (Bug #2)
❌ subscribeWithSelector first-notification spurious call (Bug #4)
❌ enableRevalidateOnFocus mass-refetch behavior under concurrent stores
❌ serializedSelectorEqual performance on large objects
❌ The published dist/ build (tests run against src/)
❌ Concurrent setStoreBatch nesting edge cases
❌ import.meta.url registry scoping under bundler transforms

Test Quality — Score: 7/10
Tests are deterministic and isolated. Each test calls clearAllStores() at the start. Async tests use proper await + deferred promises. React tests correctly use act(). No snapshot tests. No mocking of internal implementation details.
Bad pattern identified: Several SSR tests use spawnSync to launch child processes with custom NODE_ENV=production. This is creative and necessary (can't override NODE_ENV mid-process reliably), but it makes these tests slow and fragile to environment configuration.
Bad pattern: globalThis.fetch is monkey-patched in async tests. Most tests restore it in finally blocks, which is correct — but if a test fails before try and after the patch, the fetch is left modified for subsequent tests.
Edge Case Testing — Score: 6/10
Good: boundary values for retry/delay/backoff are tested. Circular references in devDeepFreeze are tested. Prototype pollution via __proto__ key is tested in utils.test.ts.
Missing:

Large state objects (performance boundary)
100+ concurrent fetchStore calls to the same endpoint
Store creation during a sync broadcast receive
Persist migration with a version jump of more than 1 (e.g., v1 → v5)

Regression Protection — Score: 6/10
The CHANGELOG documents bugs that were fixed. However, there are no explicit regression tests labeled as such ("this test exists because of bug X"). Future refactoring would need manual audit to identify which tests guard which regressions.
Testing Tools — Score: 7/10

Framework: Node.js built-in test runner (v18+ only — matches engines.node)
Mocking: Manual monkey-patching of globalThis.fetch — no mocking library
Coverage: None configured — no coverage tooling, no coverage thresholds
CI: No test execution in CI — the GitHub workflow only validates commit message formats

This is the single biggest testing infrastructure failure: CI does not run tests. A PR that breaks 20 tests will pass CI silently.


What critical tests are missing?

Tests running against dist/ build, not src/
refetchStore with Promise input
Performance tests with O(100) concurrent stores and writes
CI that actually runs the test suite

What should be improved immediately?

Add GitHub Actions workflow that runs npm test on every push
Add coverage reporting with a minimum threshold (e.g., 80%)
Test the published build, not the source
Add regression tests for each bug fixed since v0.0.1

THREE BRUTAL TRUTHS
Truth 1: The documentation is 10x more mature than the code.
You have a 24-chapter handbook, a secondary book-style docs_2.0/, benchmark scripts, and a custom status commit workflow. The CI doesn't even run your tests. The documentation investment dwarfs the quality assurance investment. Flip that ratio.
Truth 2: You are reinventing three mature libraries (Zustand + SWR + Immer) with 1/100th of the testing, ecosystem maturity, and contributor review that each of those had by v0.0.5.
That is not automatically wrong — but it means every bug you ship is one that Zustand/SWR users never encounter. The refetchStore Promise bug would have been caught in code review by any of those projects in the first week.
Truth 3: warn() being a no-op in production is a philosophical mistake for a library that markets production reliability.
"Critical failures now surface through onError" is in the v0.0.4 changelog. But sync payload silently dropped, invalid path silently rejected, and SSR warnings are all warn()-only. You've built a state library that silently diverges in production with no observable signal. That is the opposite of production reliability.
