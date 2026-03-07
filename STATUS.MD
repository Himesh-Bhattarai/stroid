# STATUS Commit Cheat Sheet
Use these STATUS codes in commit messages: `status(###): short summary`.

## Stable / Working
- `status(201)`: Working as expected (fix/feature).
- `status(202)`: Verified with real usage.
- `status(203)`: Documentation-only update (README, docs, comments).
- `status(204)`: Production-ready / release quality.

## In Progress
- `status(101)`: Draft or scaffolding.
- `status(102)`: Partial implementation.
- `status(103)`: Blocked / waiting on dependency.
- `status(104)`: Research / spike.

## Change / Improvement
- `status(300)`: Refactor (no behavior change).
- `status(301)`: New capability added.
- `status(302)`: Enhancement to existing behavior.

## Issues / Risks
- `status(401)`: Incorrect flow/usage.
- `status(403)`: Scope/responsibility issue.
- `status(408)`: Performance concern identified.
- `status(409)`: Works but risky / fragile (needs review/tests).

## Broken / Recovery
- `status(500)`: Broken / failing.
- `status(502)`: Interface/contract mismatch.
- `status(503)`: Security / auth failure.
- `status(601)`: Bug/failure fixed.
- `status(603)`: Structure/state corrected.

## Special
- `status(infinity)`: Gold master / fully trusted.
- `status(404)`: Human chaos/debugging note (does not imply code quality).

## Description Guideline
- Pair the code with a message that states the quality/intent (e.g., for fixes use `status(601)` with a summary like “fix async cleanup to avoid leak”).
- Bug fixes can use `status(601)` (preferred) or `status(201)`; the message must still reflect the quality outcome (stability, safety, perf, etc.).

## Patch0 P0 Fix Log
- `status(601)` `getstore-live-reference-leak`
  Description: `getStore()` returned shallow or live references, so nested mutations could bypass validation, history, persistence, and subscriber notifications.
  Resolution: whole-store and path reads now return deep-cloned snapshots, with tests locking that behavior.
- `status(601)` `react-hooks-live-snapshot-leak`
  Description: React-facing snapshots reused live store objects, which broke external-store safety and allowed mutation through hook snapshots.
  Resolution: `_getSnapshot()` now serves stable deep-cloned snapshots from an internal cache so React consumers only receive immutable external views.
- `status(601)` `history-production-reference-mutation`
  Description: production history entries and returned history arrays leaked mutable references to stored state.
  Resolution: history snapshots are deep-cloned on write and deep-cloned again on read, preventing mutation of state or audit history through history APIs.
- `status(601)` `validator-throw-crashes-core-ops`
  Description: validator exceptions escaped `createStore`, `setStore`, and `mergeStore`, crashing callers instead of flowing through store error handling.
  Resolution: validator execution now runs through guarded handling that reports failures via `onError` and warnings without aborting core store APIs.
- `status(601)` `lifecycle-hooks-throw-partial-commit`
  Description: lifecycle hooks could throw after state mutation started, leaving state, history, cleanup, and notifications partially applied.
  Resolution: `onCreate`, `onSet`, `onReset`, and `onDelete` now run through guarded hook execution so hook failures are reported without corrupting the store pipeline.
- `status(601)` `delete-store-subscriber-throw-aborts-cleanup`
  Description: `deleteStore()` notified subscribers without guarding exceptions, so one bad subscriber could abort teardown and leave the store half-deleted.
  Resolution: delete-time subscriber notifications now isolate throws and always continue cleanup, with regression coverage locking full teardown.
- `status(601)` `delete-store-persist-timer-resurrection`
  Description: queued persist timers survived store deletion, so a `setTimeout(0)` write could run after `deleteStore()` and recreate stale storage.
  Resolution: delete now cancels pending persist timers, and persist callbacks verify the store and config are still current before writing.
- `status(601)` `reset-store-does-not-persist`
  Description: `resetStore()` restored in-memory state but never rewrote persisted storage, so reloads could bring back stale pre-reset data.
  Resolution: reset now schedules persistence for persisted stores, and coverage verifies the saved envelope contains the reset state.
- `status(601)` `sanitize-circular-reference-stack-overflow`
  Description: circular payloads recursed forever in `sanitize()`, causing stack overflows or hard crashes during create/update flows.
  Resolution: sanitize now detects circular references, and store entry points catch sanitize failures so bad payloads are reported and rejected instead of crashing.
- `status(603)` `undefined-store-zombie-entry`
  Description: stores with `undefined` values existed in internal registries but public existence checks treated them as missing, leaving undeletable zombie entries.
  Resolution: store presence now uses key ownership instead of `!== undefined`, so `undefined` stores can be read, snapshotted, and deleted consistently.
- `status(601)` `fetchstore-callback-errors-corrupt-state`
  Description: user `onSuccess` and `onError` callbacks ran inside fetch control flow, so callback exceptions could flip successful requests into errors or reject callers unexpectedly.
  Resolution: async callbacks now run through isolated hook handling that logs failures without changing request outcome or store state.
- `status(601)` `fetchstore-server-production-silent-noop`
  Description: in server production, `fetchStore()` could continue after store creation was blocked, returning data while no store was ever created.
  Resolution: `fetchStore()` now fails fast when its backing store cannot be initialized, avoiding silent SSR no-ops and unnecessary network work.
- `status(601)` `hydrate-existing-primitive-array-stores-fails`
  Description: hydration updated existing stores through merge/path semantics, which broke primitive stores and treated arrays like path inputs instead of replacement state.
  Resolution: existing stores now hydrate through a dedicated replace pipeline that preserves validation, persistence, hooks, history, and notifications.
- `status(601)` `sync-late-message-after-delete-crash`
  Description: deleted synced stores could still receive one last queued channel message, and the stale handler assumed metadata/state still existed.
  Resolution: sync handlers now ignore stale channels and deleted stores before touching sync metadata or state, preventing post-delete crashes.
- `status(601)` `non-json-safe-values-corrupt-or-throw`
  Description: values like `NaN`, `Infinity`, `BigInt`, `Symbol`, and non-string `Map` keys could silently corrupt through JSON-based clone/persist/sync paths or throw deep inside runtime helpers.
  Resolution: sanitize now rejects non-JSON-safe values up front, and store APIs report those failures before invalid data can enter persistence, sync, or cloning flows.

## Patch1 P1 Fix Log
- `status(601)` `request-store-falsy-set-ignored`
  Description: request-scoped store helpers treated falsy buffered values like missing stores, so `0`, `false`, `""`, and `null` could not be updated.
  Resolution: request-scope updates now use key presence instead of truthiness, and tests cover falsy buffered values.
- `status(601)` `getinitialstate-returns-current-state`
  Description: `getInitialState()` exposed current store state instead of the original initial snapshot, violating the API contract.
  Resolution: `getInitialState()` now returns `_initial`, with regression coverage proving updates do not rewrite the initial snapshot.
- `status(601)` `delete-store-leaves-history-behind`
  Description: deleting a store removed live state but retained its history entries, leaving orphaned memory and stale tooling output.
  Resolution: `deleteStore()` now clears history for the removed store, with regression coverage verifying deleted stores no longer report past history.
- `status(601)` `getstoremeta-live-reference-leak`
  Description: `getStoreMeta()` returned only a shallow copy, so callers could mutate live nested `options` and `metrics`.
  Resolution: metadata reads now return deep-cloned snapshots, preventing inspector-style code from changing runtime behavior.
- `status(601)` `primitive-store-object-merge-shape-change`
  Description: `setStore(name, object)` could silently turn primitive stores into objects by running the merge path against non-object state.
  Resolution: object-merge updates are now rejected for non-object stores, preserving the store shape established at creation.
- `status(601)` `sanitize-inherited-properties-and-getters`
  Description: `sanitize()` walked inherited enumerable properties and could execute accessor getters while normalizing input objects.
  Resolution: sanitization now only reads own enumerable data properties and rejects accessor properties before they can execute during store writes.
- `status(601)` `fetchstore-retry-abort`
  Description: aborting during retry backoff still allowed one more retry cycle because the signal was not checked between attempts.
  Resolution: `fetchStore()` now settles aborted state before and after retry delays so aborting backoff prevents any further network attempts.
- `status(601)` `reentrant-notify-drops-follow-up-updates`
  Description: subscriber-triggered `setStore()` calls could enqueue a second notification and then lose it when the current flush cleared the pending set.
  Resolution: the notify queue now drains one batch at a time and reschedules when re-entrant updates arrive, so follow-up notifications are delivered instead of dropped.
- `status(601)` `subscribe-with-selector-false-positives`
  Description: selector subscriptions compared against deep-cloned notify snapshots, so object and array selectors fired on unrelated updates under the default `Object.is` equality.
  Resolution: selector subscriptions now evaluate against the canonical store state and only clone values at the listener boundary, preserving correct slice equality while still isolating listener mutations.
- `status(601)` `path-keys-with-dots-unaddressable`
  Description: string path parsing always split on `.`, so literal dotted keys and entity IDs like `a.b` could not be addressed correctly through the public helpers.
  Resolution: path parsing now supports escaped dots, and `createEntityStore().get()` uses exact path segments so dotted IDs resolve safely.
- `status(601)` `fetchstore-unbounded-retry-storm`
  Description: `fetchStore()` accepted non-finite or degenerate retry settings like `retry: Infinity` and `retryDelay: 0`, which could create sustained retry storms against failing services.
  Resolution: retry attempts, delay, and backoff are now normalized to bounded safe values before the request loop starts, with regression coverage locking a finite retry policy.
- `status(601)` `env-fallback-defaults-to-development-in-node`
  Description: the environment comment promised unknown runtimes would default to production, but Node without `NODE_ENV` still resolved to development mode.
  Resolution: the environment fallback is now production in every unknown runtime, with a regression test covering bare Node imports without `NODE_ENV`.
- `status(601)` `redactor-affects-sync-payload`
  Description: sync broadcasting reused the redactor output, so privacy tooling could strip canonical state before cross-tab replication and conflict handling.
  Resolution: BroadcastChannel sync now sends the canonical store state, while redaction remains limited to debug/history-style surfaces.
- `status(601)` `create-selector-invalidates-on-unrelated-updates`
  Description: `createSelector()` memoized only on the root store reference, so unrelated writes recomputed derived selectors even when the accessed slice did not change.
  Resolution: selectors now track the state paths they read and reuse the previous result when those dependencies stay unchanged across store updates.
- `status(601)` `async-cache-unbounded-growth`
  Description: async cache registries kept every unique `cacheKey` entry alive until store deletion, so high-cardinality cache usage could cause unbounded process memory growth.
  Resolution: async cache entries now expire, request-version slots are cleared after requests settle, and per-store cache slots are bounded with oldest-entry eviction.

## Remain Fix Log
- `status(601)` `create-store-persist-load-order`
  Description: persisted stores scheduled a save of the initial value before reading existing storage, so a stale first-tick write could overwrite real persisted state during initialization.
  Resolution: persisted stores now load existing storage first and only schedule an initial save when no persisted payload exists, with regression coverage locking that order.
- `status(601)` `sanitize-forbidden-prototype-keys`
  Description: sanitization preserved dangerous keys like `__proto__`, `constructor`, and `prototype`, leaving merge-style updates vulnerable to pollution-style inputs.
  Resolution: sanitization now strips forbidden prototype-shaping keys before values can enter store state, with regression coverage proving merge updates keep Object.prototype untouched.
- `status(601)` `deepclone-no-shallow-fallback`
  Description: `deepClone()` silently fell back to shallow copies after clone failures, which could leak nested references into snapshots, history, and initial state handling.
  Resolution: clone failures now use a real recursive fallback with circular-reference support instead of degrading to shallow copies, with regression coverage forcing the fallback path.
- `status(601)` `setstorebatch-async-guard`
  Description: `setStoreBatch()` accepted async callbacks, which could let batch depth span await boundaries and flush notifications out of order across ticks.
  Resolution: batch callbacks are now validated as synchronous-only, with regression coverage proving async callbacks are rejected before they mutate store state.
- `status(601)` `request-store-missing-set-throws`
  Description: `createStoreForRequest().set()` silently ignored unknown store names, so SSR typos could drop request-local state with no visible failure.
  Resolution: request-scope updates now throw when `set()` targets a store that was never created in the request buffer, with regression coverage locking the failure mode.
- `status(601)` `fetchstore-promise-retry-disabled`
  Description: `fetchStore()` accepted retry settings for direct Promise inputs even though retries only re-awaited the same settled promise and never retried real work.
  Resolution: direct Promise inputs now disable retry attempts explicitly and emit a warning in development, with regression coverage proving retry delays are skipped.
- `status(601)` `entity-fallback-id-collision`
  Description: entity helper fallback IDs depended on timestamp and randomness only, so rapid inserts under mocked clocks could collide and overwrite earlier entities.
  Resolution: fallback entity IDs now use a monotonic counter plus timestamp, with regression coverage proving repeated inserts stay unique even when the clock is fixed.

## Debugging Bug Fix Log
- `status(601)` `deepclone-fallback-plain-enumerable-data`
  Description: the recursive clone fallback preserved prototype chains and copied hidden descriptors, which reintroduced prototype-shaped state and non-enumerable leakage through snapshot/history paths when `structuredClone` was unavailable.
  Resolution: object fallback clones are now rebuilt as plain enumerable data objects only, skipping forbidden prototype keys, accessors, and non-enumerable properties, with regression coverage forcing the fallback path.
- `status(601)` `setstorebatch-promise-return-flush`
  Description: promise-returning batch callbacks could enqueue synchronous updates and then fail the batch contract, leaving flush timing dependent on `finally` ordering instead of an explicit notify path.
  Resolution: `setStoreBatch()` now schedules queued notifications before rejecting promise-returning callbacks, and regression coverage locks the synchronous-update flush behavior.
- `status(601)` `react-inline-selector-stability`
  Description: inline selector functions passed to `useStore()` and `useSelector()` forced subscription churn and unstable snapshot recomputation, which could spiral into render loops or needless rerenders when selector identities changed every render.
  Resolution: React selector hooks now read selector/equality functions through refs and cache selected snapshots by store snapshot identity, while a build check locks the hook implementation against type/package regressions.
- `status(601)` `fetchstore-stale-version-and-abort-delay`
  Description: concurrent fetches could delete each other’s request-version marker on settle, and retry backoff waited out the full timeout even after abort, producing stale drops and slow abort recovery under real overlap.
  Resolution: async request cleanup now only clears the active version slot, retry delay becomes abort-aware, and regressions cover ordered overlap plus prompt abort settlement during backoff.
- `status(601)` `setstorebatch-thenable-type-contract`
  Description: the batch callback was still typed as `() => void` even though the runtime inspects its return value for thenables, which broke DTS generation and made the promise-return guard an invalid type contract.
  Resolution: `setStoreBatch()` now accepts `() => unknown` at the type boundary so the runtime guard and declaration build agree.
- `status(601)` `middleware-throw-vetoes-update`
  Description: throwing middleware previously reported an error but still let the write pipeline commit, so middleware could not reliably block unsafe updates.
  Resolution: middleware failures now abort the in-flight write before state/history/notify side effects run, and regression coverage proves blocked writes do not commit while later valid writes still work.
- `status(601)` `selector-serialization-fallback-without-hash-collision`
  Description: selector subscriptions relied on a CRC32 hash shortcut to suppress object-churn false positives, which left a collision-based path for silently missed updates.
  Resolution: object-selector fallback matching now compares full serialized JSON-safe content instead of CRC32 hashes, preserving the no-noise behavior for rebuilt objects without hash-collision risk.
- `status(601)` `iterative-devdeepfreeze`
  Description: recursive `devDeepFreeze()` could overflow the call stack on deeply nested payloads and had no cycle handling, making development-only safety checks crash on pathological state shapes.
  Resolution: deep-freeze now uses an iterative, cycle-safe traversal, with regression coverage for very deep and circular objects.
- `status(202)` `react-inline-selector-runtime-coverage`
  Description: the React inline-selector fix had build verification but no runtime renderer coverage, leaving the most user-facing hook path unproven under actual render/update cycles.
  Resolution: added React hook smoke tests that mount `useStore()` with inline primitive and object selectors, verify unrelated writes do not rerender selected output, and confirm the selector path does not enter a render loop.
- `status(601)` `ssr-store-creation-observability`
  Description: blocked production-SSR store creation still failed too quietly, so direct `createStore(...)` calls and `hydrateStores(...)` creation paths could drop state with no structured error signal.
  Resolution: blocked production server creation now reports through `onError` and production console output, with regression coverage for both direct create and hydration paths.
- `status(601)` `fetchstore-ssr-observability`
  Description: `fetchStore(...)` still returned `null` silently when asked to create a backing store on the server in production, so callers had no async-specific signal that the environment was unsupported.
  Resolution: `fetchStore()` now fails fast with its own `onError`/production console reporting before any network work starts, with regression coverage for the blocked SSR path.
- `status(601)` `validator-onerror-deduping`
  Description: validator failures could call the same `onError` handler twice when the runtime path passed both the stored handler and the same function as an explicit callback.
  Resolution: validator reporting now deduplicates handler invocations while keeping update blocking behavior intact, with regression coverage for update and initialization paths.
- `status(601)` `clearallstores-reentrant-deletes`
  Description: `clearAllStores()` only snapshotted store names once, so any store created during delete hooks or subscriber cleanup could survive the clear-all pass.
  Resolution: the clear-all path now drains stores until registries are empty, with regression coverage for stores created during delete hooks.
- `status(601)` `resetallstoresfortest-hard-reset`
  Description: `resetAllStoresForTest()` reused the normal delete pipeline, so test cleanup fired real `onDelete` hooks and other side effects that should not run during isolated test resets.
  Resolution: test resets now use a dedicated hard-reset path that clears registries, timers, sync resources, and snapshot state without invoking user hooks, with regression coverage proving delete hooks stay silent.
- `status(601)` `chain-missing-store-observability`
  Description: `chain()` warned in development but collapsed into silent read/write no-ops in production when the target store did not exist yet.
  Resolution: chain reads and writes now surface explicit missing-store errors in production too, with regression coverage for missing root and target-path access.
- `status(601)` `store-name-suggestion-length-guard`
  Description: typo suggestions ran full Levenshtein distance across arbitrary user input, so very long missing store names could trigger quadratic CPU and memory work just to format an error.
  Resolution: store-name suggestions now gate edit-distance checks by bounded input size and use a rolling-row algorithm for the remaining short cases, with regression coverage for hostile long names and normal short suggestions.
