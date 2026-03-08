STROID TEST EXECUTION MATRIX

Rules
1. Follow commit system , Refrence: Status.MD
2. Create test_report folder and every test report provided there in below structure fine name should be [date.md] ie, 3-8-2026, every time test run provide report, singlw test report , test_report contain max 10 report so if 10 report still there and when test run that bust auto delete last one

Goal
- Turn the generic "100% coverage" idea into a Stroid-specific testing roadmap.
- Track what is already covered, what is missing, and what still needs a product decision before a test should be written.
- Use this as a working local plan, not as public docs.

Status Legend
- COVERED: behavior already has meaningful tests
- GAP: test coverage is missing or too weak
- DECISION: behavior is not fully specified yet, so tests should wait for an explicit rule
- LATER: valid test area, but not a priority until core/API work settles

Current Stroid Surface To Test
- Core store API:
  - createStore
  - setStore
  - setStoreBatch
  - getStore
  - deleteStore
  - resetStore
  - mergeStore
  - clearAllStores
  - hasStore
  - listStores
  - getStoreMeta
  - getInitialState
  - getHistory
  - clearHistory
  - getMetrics
  - createStoreForRequest
  - hydrateStores
  - subscribeWithSelector
  - createSelector
  - createCounterStore
  - createListStore
  - createEntityStore
  - createZustandCompatStore
- Chain API:
  - chain
- Async API:
  - fetchStore
  - refetchStore
  - enableRevalidateOnFocus
  - getAsyncMetrics
- React API:
  - useStore
  - useStoreField
  - useSelector
  - useStoreStatic
  - useAsyncStore
  - useFormStore
- Testing helpers:
  - createMockStore
  - withMockedTime
  - resetAllStoresForTest
  - benchmarkStoreSet

Execution Flow
1. Lock core behavior first.
- Finish tests for create/set/get/delete/reset/merge/subscribe/history/SSR safety.
- Do not add broad type/perf/browser work before this is stable.

2. Finish module behavior next.
- persist
- sync
- lifecycle
- devtools/history/redaction
- async

3. Then cover integration surfaces.
- React hooks
- chain ergonomics
- testing helpers

4. Then add compile-time coverage.
- Type inference
- invalid usage
- grouped options typing
- legacy compatibility typing

5. Then run heavier suites.
- stress
- performance
- memory leak checks
- cross-environment checks
- mutation testing

Decision Gates Before Writing Tests
- Whether "temporary store" semantics will exist and how deletion is triggered
- Whether duplicate subscriber registration is allowed by design
- Whether subscribe-during-notify receives the current cycle or the next cycle
- Whether undefined/null should ever be valid full-store payloads beyond current JSON-safe rules
- Whether legacy flat options should warn forever or only through one deprecation window
- Whether grouped options become the documented primary API before types/docs fully switch

Module Matrix

1. Core Store Lifecycle
- createStore with object, primitive, array, nested object: COVERED
- createStore invalid names / invalid data / duplicate names: COVERED
- createStore production SSR blocking and opt-in behavior: COVERED
- createStore grouped options normalization path: COVERED
- createStore warnings for legacy flat options: COVERED
- createStoreForRequest buffering, request-scoped hydration, falsy updates: COVERED
- createStore with undefined initial state fallback behavior: DECISION
- createStore for all factory helpers:
  - createCounterStore: GAP
  - createListStore: GAP
  - createEntityStore: PARTIAL
  - createZustandCompatStore: GAP

2. Reads And Writes
- getStore returns deep-cloned snapshots: COVERED
- getStore missing store behavior: COVERED
- setStore direct object merge, full replace-like writes, path updates: COVERED
- setStore array index validation and path rejection: COVERED
- setStore type mismatch blocking and validator/schema failure handling: COVERED
- setStoreBatch async rejection and notification flushing: COVERED
- mergeStore merge semantics: COVERED
- resetStore initial-state restore: COVERED
- getInitialState snapshot behavior: COVERED
- explicit "same logical state means no notification" guarantees: GAP
- explicit undefined/null whole-store write behavior: DECISION

3. Subscriptions And Notification Semantics
- basic subscribe/unsubscribe behavior: COVERED
- subscriber-thrown errors do not break cleanup: COVERED
- subscriber-triggered follow-up updates: COVERED
- subscribeWithSelector unrelated update filtering: COVERED
- createSelector dependency-aware recomputation: COVERED
- registration order guarantee for subscribers: GAP
- duplicate subscription of same callback: DECISION
- subscribe during active notify cycle: DECISION
- unsubscribe another subscriber during notify: GAP
- new subscriber current-cycle delivery semantics: DECISION

4. History, Devtools, And Metrics
- getHistory / clearHistory basics: PARTIAL
- history immutability: COVERED
- deleteStore clears orphaned history: COVERED
- redactor interaction with devtools/history: PARTIAL
- historyLimit boundary behavior: GAP
- getMetrics correctness and reset expectations: GAP

5. Persistence
- save and reload basic persisted state: COVERED
- resetStore persists reset state: COVERED
- createStore avoids overwriting existing persisted state on init: COVERED
- migration success / failure paths: COVERED
- onStorageCleared behavior: COVERED
- queued persist cleanup on deleteStore: COVERED
- persist driver failure reporting: COVERED
- grouped persist options (`persist.version`, `persist.migrations`): COVERED
- encryption/decryption hooks: GAP
- custom serialize/deserialize hooks: GAP
- session storage and custom driver parity: GAP
- storage corruption fallback matrix: PARTIAL

6. Sync
- missing BroadcastChannel handling: COVERED
- payload broadcast behavior: COVERED
- payload size limit handling: COVERED
- ordering with monotonic clocks: COVERED
- reconnect snapshot request flow: COVERED
- delete-after-message safety: COVERED
- sync with redactor present still broadcasts canonical state: COVERED
- conflictResolver behavior under contested writes: GAP
- grouped sync option normalization edge cases: GAP
- channel cleanup on repeated create/delete cycles: GAP

7. Lifecycle And Middleware
- middleware veto/error behavior: COVERED
- lifecycle hook errors do not leave partial commits: COVERED
- grouped lifecycle normalization path: COVERED
- middleware execution order across multiple middleware functions: GAP
- onCreate / onSet / onReset / onDelete exact call ordering: GAP
- middleware path/action metadata correctness: GAP
- middleware mutating next payload contract: GAP

8. Async
- dedupe behavior: COVERED
- request racing and last-write-wins semantics: COVERED
- stale-while-revalidate behavior: COVERED
- retry clamping / retry abort behavior: COVERED
- inflight slot cap and cache slot eviction: COVERED
- no AbortSignal warning behavior: PARTIAL
- onSuccess/onError callback fault isolation: COVERED
- deleteStore cleanup of async listeners and metadata: COVERED
- production SSR async-store creation blocking: COVERED
- refetchStore no-previous-fetch behavior: GAP
- getAsyncMetrics value correctness: GAP
- enableRevalidateOnFocus wildcard and named cleanup behavior: PARTIAL

9. React
- inline primitive selector stability: COVERED
- inline object selector with custom equality: COVERED
- useStoreField behavior: GAP
- useSelector public API coverage separate from useStore internals: GAP
- useStoreStatic semantics: GAP
- useAsyncStore integration with fetchStore state: GAP
- useFormStore lifecycle and update behavior: GAP
- unmount cleanup across repeated mount/unmount cycles: PARTIAL
- concurrent React transitions / deferred update behavior: LATER

10. Chain API
- chain read/write happy path: COVERED
- chain missing-store safety in production: COVERED
- deeper fluent combinations and rollback/error semantics: GAP

11. Testing Helpers
- createMockStore helper behavior: GAP
- withMockedTime restores Date.now on throw: GAP
- resetAllStoresForTest registry reset behavior: COVERED
- benchmarkStoreSet returns stable structure and respects iteration count: GAP

12. Type Safety
- createStore state inference: GAP
- getStore / setStore typing: GAP
- selector return inference: GAP
- hook selector inference: GAP
- grouped options typing:
  - scope
  - validate
  - persist.version
  - persist.migrations
  - devtools object form
  - lifecycle object form
  - sync object form
  all: GAP
- legacy flat option compatibility typing: GAP
- negative tests with `@ts-expect-error`: GAP
- helper/factory typing:
  - createCounterStore
  - createListStore
  - createEntityStore
  - createZustandCompatStore
  GAP

13. Security And Data Hygiene
- prototype pollution blocking: COVERED
- inherited/accessor property rejection: COVERED
- circular structure rejection in sanitize path: COVERED
- symbol/function handling expectations: DECISION
- XSS is application-level, not a core library test target: LATER

14. Stress, Performance, And Memory
- large nested state stress: PARTIAL
- many subscribers performance: GAP
- repeated updates under load: GAP
- repeated create/delete stability: GAP
- subscriber garbage-collection style tests: LATER
- heap-stable repeated async usage: LATER
- benchmark thresholds in CI: LATER

15. Cross-Environment
- Node test execution: COVERED
- browser storage path behavior: PARTIAL
- Web Worker / worker-like sync behavior: GAP
- React Native / AsyncStorage: LATER
- Deno: LATER
- IE11: out of scope unless browser support policy changes

Recommended File Split For Future Test Work
- tests/store.core.test.ts
  - create/get/set/reset/delete/merge/history/meta
- tests/store.subscribe.test.ts
  - subscribe/notify/selector semantics
- tests/store.factories.test.ts
  - counter/list/entity/zustand-compat
- tests/options-adapter.test.ts
  - grouped options and deprecations
- tests/persist.test.ts
  - persist/migrations/storage hooks
- tests/sync.test.ts
  - sync clocks/channels/conflict behavior
- tests/lifecycle.test.ts
  - middleware/hooks
- tests/async.test.ts
  - fetch/refetch/revalidate/metrics
- tests/react-hooks.test.tsx
  - hook behavior
- tests/testing.test.ts
  - helper utilities
- tests/types/
  - compile-time tests once type test tooling is added

Priority Order

Phase A: finish core certainty
- factory helper tests
- historyLimit / metrics tests
- middleware order and hook-order tests
- refetchStore / async metrics tests
- React hook gaps that map directly to current public API

Phase B: finish grouped API confidence
- grouped sync tests
- grouped devtools tests
- grouped type tests
- legacy-compat type tests

Phase C: decision-driven work
- duplicate subscriber behavior
- subscribe during notify
- undefined/null full-store semantics
- temporary/global lifetime semantics once architecture lands

Phase D: heavy suites
- stress/perf
- memory
- worker/browser matrix
- mutation testing

Definition Of Done For Test Program
- Core public API has scenario coverage, not only line coverage.
- New grouped option model has both runtime tests and type tests.
- Legacy compatibility paths have explicit tests while they remain supported.
- Decision-dependent behaviors are documented before tests are added.
- Heavy non-functional suites are separated from the default fast test run.
