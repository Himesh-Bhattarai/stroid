# Stroid Forensic Engineering Audit Report

Date: 2026-03-13
Scope: Repository at `c:\Users\Himesh\Desktop\SM_STROID\stroid`. Excluded `node_modules`, `stroid-website`, and `.git` per request.

PHASE 0 - FULL REPOSITORY TRAVERSAL

File tree (scoped):
```text
# SCOPED TREE (excluded: node_modules, stroid-website, .git)
.
|-- .github
|   |-- ISSUE_TEMPLATE
|   |   |-- bug_report.yml
|   |   |-- config.yml
|   |   |-- feature_request.yml
|   |   \-- status.yml
|   |-- workflows
|   |   |-- ci.yml
|   |   |-- discussion-bot.yml
|   |   \-- status-commit.yml
|   \-- pull_request_template.md
|-- .qodo
|   |-- agents
|   \-- workflows
|-- audit_chunks
|-- dist
|   |-- types
|   |   |-- adapters
|   |   |-- features
|   |   |-- integrations
|   |   |-- internals
|   |   \-- store-lifecycle
|   |-- async.cjs
|   |-- async.js
|   |-- computed.cjs
|   |-- computed.js
|   |-- core.cjs
|   |-- core.js
|   |-- devtools.cjs
|   |-- devtools.js
|   |-- helpers.cjs
|   |-- helpers.js
|   |-- index.cjs
|   |-- index.js
|   |-- persist.cjs
|   |-- persist.js
|   |-- react.cjs
|   |-- react.js
|   |-- runtime-admin.cjs
|   |-- runtime-admin.js
|   |-- runtime-tools.cjs
|   |-- runtime-tools.js
|   |-- selectors.cjs
|   |-- selectors.js
|   |-- server.cjs
|   |-- server.js
|   |-- sync.cjs
|   |-- sync.js
|   |-- testing.cjs
|   \-- testing.js
|-- docs_2.0
|   |-- ARCHITECTURE
|   |   \-- ARCHITECTURE.md
|   |-- BACK_MATTER
|   |   |-- APPENDICES.md
|   |   |-- BACK_COVER.md
|   |   |-- Bibliography.md
|   |   |-- Colophon.md
|   |   \-- Contact_Information.md
|   |-- BODY_MATTER
|   |   |-- ASYNC_OF_STROID
|   |   |   |-- CACHE_AND_REVALIDATION.md
|   |   |   |-- FETCH_FLOW.md
|   |   |   |-- INTRODUCTION.md
|   |   |   \-- REAL_USE.md
|   |   |-- BEGINNER_GUIDE
|   |   |   |-- FIRST_STORE.md
|   |   |   |-- FROM_BASIC_TO_REAL.md
|   |   |   |-- INSTALL_AND_IMPORTS.md
|   |   |   |-- REACT_USAGE.md
|   |   |   \-- START_HERE.md
|   |   |-- BINARY_TO_BEING
|   |   |   |-- ASYNC_LAYER.md
|   |   |   |-- DESIGN_PRINCIPLES_OF_STROID.md
|   |   |   |-- PERSISTENCE_LAYER.md
|   |   |   |-- PRODUCTION_PATTERNS.md
|   |   |   |-- REACT_BINDINGS.md
|   |   |   |-- RUNTIME_ARCHITECTURE.md
|   |   |   |-- SELECTORS.md
|   |   |   |-- STORE_SYSTEM.md
|   |   |   |-- TOOLING_AND_DEBUGGING.md
|   |   |   \-- WHY_STATE_MANAGEMENT_FAILS_IN_LARGE_APPS.md
|   |   |-- BUG_AS_HELPER
|   |   |   |-- INTENTIONAL_BUGS.md
|   |   |   |-- INTRODUCTION.md
|   |   |   |-- NO_NEED_TO_FIX.md
|   |   |   \-- REAL_USE.md
|   |   |-- CORE_OF_STROID
|   |   |   |-- CORE_OPTIONS.md
|   |   |   |-- EXAMPLE.md
|   |   |   |-- INTRODUCTION.md
|   |   |   \-- REAL_USE.md
|   |   |-- DEVTOOLS_OF_STROID
|   |   |   |-- HISTORY_AND_REDACTION.md
|   |   |   |-- INTRODUCTION.md
|   |   |   |-- REAL_USE.md
|   |   |   \-- REDUX_DEVTOOLS_AND_BOUNDARIES.md
|   |   |-- HELPERS_AND_CHAIN_OF_STROID
|   |   |   |-- CHAIN_API.md
|   |   |   |-- HELPER_FACTORIES.md
|   |   |   |-- INTRODUCTION.md
|   |   |   \-- REAL_USE.md
|   |   |-- OPT_IN_FEATURES_OF_STROID
|   |   |   |-- INTRODUCTION.md
|   |   |   |-- POWER_TOOLS.md
|   |   |   |-- RUNTIME_LAYERS.md
|   |   |   \-- STORE_FEATURES.md
|   |   |-- PERSIST_OF_STROID
|   |   |   |-- FAILURE_AND_RECOVERY.md
|   |   |   |-- INTRODUCTION.md
|   |   |   |-- REAL_USE.md
|   |   |   \-- STORAGE_AND_MIGRATIONS.md
|   |   |-- PHILOSOPHY_OF_STROID
|   |   |   |-- MINIMAL_ABSTRACTION.md
|   |   |   |-- OPTIONAL_COMPLEXITY_AND_COMPARISON.md
|   |   |   |-- PREDICTABLE_STATE_MUTATION.md
|   |   |   |-- RUNTIME_OBSERVABILITY.md
|   |   |   \-- WHY_THE_MIND_NEEDS_STRUCTURE.md
|   |   |-- REACT_OF_STROID
|   |   |   |-- FORM_AND_ASYNC.md
|   |   |   |-- HOOKS.md
|   |   |   |-- INTRODUCTION.md
|   |   |   \-- REAL_USE.md
|   |   |-- ROADMAP_OF_STROID
|   |   |   \-- ROADMAP.md
|   |   |-- RUNTIME_OPERATIONS_OF_STROID
|   |   |   |-- ADMIN_OPERATIONS.md
|   |   |   |-- INSPECTION_TOOLS.md
|   |   |   |-- INTRODUCTION.md
|   |   |   \-- REAL_USE.md
|   |   |-- SELECTORS_OF_STROID
|   |   |   |-- CREATE_SELECTOR.md
|   |   |   |-- INTRODUCTION.md
|   |   |   |-- REAL_USE.md
|   |   |   \-- SUBSCRIBE_WITH_SELECTOR.md
|   |   |-- SERVER_OF_STROID
|   |   |   |-- HYDRATE_FLOW.md
|   |   |   |-- INTRODUCTION.md
|   |   |   |-- REAL_USE.md
|   |   |   \-- REQUEST_SCOPE.md
|   |   |-- SYNC_OF_STROID
|   |   |   |-- CONFLICTS_AND_RECOVERY.md
|   |   |   |-- INTRODUCTION.md
|   |   |   |-- REAL_USE.md
|   |   |   \-- SYNC_OPTIONS.md
|   |   |-- TESTING_OF_STROID
|   |   |   |-- INTRODUCTION.md
|   |   |   |-- MOCKS_AND_TIME.md
|   |   |   |-- REAL_USE.md
|   |   |   \-- RESETS_AND_BENCHMARKS.md
|   |   |-- THE_GLITCH_IN_MATRIX
|   |   |   |-- INTRODUCTION.md
|   |   |   |-- PERFORMANCE_AND_REALITY.md
|   |   |   |-- REAL_USE.md
|   |   |   \-- TRADEOFFS_AND_LIMITS.md
|   |   \-- BACK_COVER.md
|   \-- FRONT_MATTER
|       |-- ABOUT_AUTHOR.md
|       |-- ACKNOWLEDGE.md
|       |-- CONTENTS.md
|       |-- COPYRIGHT.md
|       |-- DEDICATION.md
|       |-- EPIGRAPH.md
|       |-- FOREWORD.md
|       |-- FRONT_COVER_PAGE.md
|       |-- HOW_TO_USE.md
|       |-- INTRODUCTION.md
|       |-- LIST_OF_TABLE.md
|       |-- PRAISE.md
|       |-- PREFACE.md
|       \-- TITLE_PAGE.md
|-- scripts
|   |-- compare-state-libraries.ts
|   |-- deep-update-benchmark.ts
|   |-- lifecycle-benchmark.ts
|   |-- selector-benchmark.ts
|   |-- stroid-advanced-benchmark-output.json
|   |-- stroid-advanced-benchmark.ts
|   |-- subscriber-benchmark.ts
|   \-- sync-scale-benchmark.ts
|-- src
|   |-- adapters
|   |   \-- options.ts
|   |-- features
|   |   |-- persist
|   |   |   |-- crypto.ts
|   |   |   |-- load.ts
|   |   |   |-- save.ts
|   |   |   |-- types.ts
|   |   |   \-- watch.ts
|   |   |-- devtools.ts
|   |   |-- lifecycle.ts
|   |   |-- persist.ts
|   |   \-- sync.ts
|   |-- integrations
|   |   \-- query.ts
|   |-- internals
|   |   |-- config.ts
|   |   |-- diagnostics.ts
|   |   |-- hooks-warnings.ts
|   |   |-- selector-store.ts
|   |   \-- store-admin.ts
|   |-- store-lifecycle
|   |   |-- bind.ts
|   |   |-- hooks.ts
|   |   |-- identity.ts
|   |   |-- registry.ts
|   |   |-- types.ts
|   |   \-- validation.ts
|   |-- async-cache.ts
|   |-- async-fetch.ts
|   |-- async-registry.ts
|   |-- async-retry.ts
|   |-- async.ts
|   |-- computed-entry.ts
|   |-- computed-graph.ts
|   |-- computed.ts
|   |-- config.ts
|   |-- core.ts
|   |-- devfreeze.ts
|   |-- devtools-api.ts
|   |-- devtools.ts
|   |-- feature-registry.ts
|   |-- helpers.ts
|   |-- hooks-async-suspense.ts
|   |-- hooks-async.ts
|   |-- hooks-core.ts
|   |-- hooks-form.ts
|   |-- hooks.ts
|   |-- index.ts
|   |-- persist.ts
|   |-- runtime-admin.ts
|   |-- runtime-tools.ts
|   |-- selectors-entry.ts
|   |-- selectors.ts
|   |-- server.ts
|   |-- store-lifecycle.ts
|   |-- store-name.ts
|   |-- store-notify.ts
|   |-- store-read.ts
|   |-- store-registry.ts
|   |-- store-transaction.ts
|   |-- store-write.ts
|   |-- store.ts
|   |-- sync.ts
|   |-- testing.ts
|   \-- utils.ts
|-- tests
|   |-- heavy
|   |   |-- environment.heavy.ts
|   |   |-- snapshot-cache.heavy.ts
|   |   |-- store.heavy.ts
|   |   |-- stress-memory.heavy.ts
|   |   \-- sync.heavy.ts
|   |-- types
|   |   |-- ambient-store-map.types.ts
|   |   |-- assert.ts
|   |   |-- package-declarations.types.ts
|   |   \-- public-api.types.ts
|   |-- async-cleanup.test.ts
|   |-- async-revalidate-cleanup.test.ts
|   |-- async.test.ts
|   |-- computed.test.ts
|   |-- feature-applied-state.test.ts
|   |-- options-adapter.test.ts
|   |-- persist.test.ts
|   |-- react-hooks.test.tsx
|   |-- regressions.test.ts
|   |-- selectors-devfreeze.test.ts
|   |-- setup.ts
|   |-- ssr-carrier.test.ts
|   |-- store.core.test.ts
|   |-- store.node-env.test.ts
|   |-- strict-missing-features.test.ts
|   |-- sync.core.test.ts
|   |-- testing.test.ts
|   \-- utils.test.ts
|-- .eslintrc.json
|-- .gitignore
|-- audit_inspection_scoped.csv
|-- AUDIT_REPORTS.md
|-- audit_tree.txt
|-- audit_tree_full.txt
|-- audit_tree_scoped.txt
|-- BLOG.MD
|-- CHANGELOG.md
|-- CODE_OF_CONDUCT.md
|-- CONTRIBUTING.md
|-- LICENSE
|-- package-lock.json
|-- package.json
|-- README.md
|-- STATUS.MD
|-- tsconfig.build.json
|-- tsconfig.eslint.json
|-- tsconfig.json
|-- tsconfig.types.json
|-- tsconfig.typetests.json
|-- tsup.config.ts
\-- vercel.json
```

Total file count: 252
Total source file count: 67 (definition: JS/TS files under `src/` and `scripts/`)
Total test file count: 27 (definition: files under `tests/` or matching `*.test.*` or `*.spec.*`)
Inspection log: `audit_inspection_scoped.csv` (path, bytes, lines, binary) covers all 252 files.
ALL FILES HAVE BEEN INSPECTED

PHASE 1 - ARCHITECTURE RECONSTRUCTION

What problem this library solves:
Stroid is a JS/TS state management library for web and server environments. It provides a central store registry, computed stores, async fetching and caching, persistence, cross-tab synchronization, devtools integration, and React hooks.

Core design philosophy:
Minimal abstraction over plain JS data; explicit store names; opt-in features layered on a stable core; runtime validation and diagnostics to catch misuse; predictable mutation through transactions and controlled notifications.

Main architectural pattern:
Layered architecture around a single registry with feature hooks (plugin-like) and optional runtime layers (persist, sync, devtools).

State model:
A global StoreRegistry holds store values, metadata, initial states and factories, subscribers, snapshot cache, computed graph, async cache slots, and feature-specific metadata.

Data flow:
createStore -> registry + meta setup -> setStore / reset / delete -> validate + sanitize -> middleware -> commit -> notify -> feature hooks -> subscribers and computed recomputations. Async fetch writes to cache and store, persist serializes store state, sync broadcasts versioned state, and devtools emits timelines.

Control flow:
Synchronous write path with optional transactions and batched notifications; async fetches use Promise workflows with retry policies; sync and persist are event-driven and schedule tasks with timers.

MODULE MAP
1. `src/store-registry.ts` and `src/store-lifecycle/registry.ts` - global registry state and metadata; used by all core operations.
2. `src/store-lifecycle/validation.ts` and `src/store-lifecycle/hooks.ts` - validation, path safety, and feature hook bridging.
3. `src/store-write.ts` and `src/store-read.ts` - public write/read APIs; delegate to lifecycle and notify.
4. `src/store-notify.ts` and `src/store-transaction.ts` - subscriber delivery, snapshot caching, batching, transaction staging.
5. `src/computed.ts`, `src/computed-graph.ts`, `src/computed-entry.ts` - computed stores and dependency tracking; uses store read/write and notifications.
6. `src/selectors.ts`, `src/selectors-entry.ts`, `src/internals/selector-store.ts` - selector subscriptions and memoization.
7. `src/async-cache.ts`, `src/async-fetch.ts`, `src/async-registry.ts`, `src/async-retry.ts` - async data lifecycle and caching.
8. `src/features/*` and `src/feature-registry.ts` - optional features (persist, sync, devtools, lifecycle) wired through feature hooks.
9. `src/hooks*.ts` and `src/react.ts` entries - React bindings, selectors, and async hooks.
10. `src/runtime-admin.ts`, `src/runtime-tools.ts`, `src/internals/*` - diagnostics and admin operations.
11. `src/server.ts` - SSR utilities and request-scoped store creation.

PHASE 2 - CORE ENGINEERING AUDIT

1. Simplicity and Clarity - Score: 7/10
Weaknesses: Many optional features expand the mental model; some internals surface through public APIs.
Strengths: File headers declare ownership and dependencies; layering is mostly explicit.
Production Risks: Misuse of advanced APIs and inconsistent feature setup.
Improvement Suggestions: Provide a minimal-core usage path and a single architecture diagram in README.

2. Reliability and Consistency - Score: 6/10
Weaknesses: Cross-feature interactions and time-based sync resolution can produce surprising outcomes under load, especially when persist and sync update the same store within tight windows or when clocks drift across tabs.
Strengths: Strong runtime validation and error reporting; transactions reduce inconsistent writes.
Production Risks: State divergence and performance cliffs in uncommon but realistic flows, including conflict resolution that depends on wall-clock time and heavy snapshot cloning during bursty updates.
Improvement Suggestions: Add tests for feature-applied state (path cache invalidation), sync conflicts (conflictResolver behavior), and security defaults (malformed message rejection). Provide guidance on sync conflict policies and time-source assumptions.
Status: Tests added for feature-applied state, sync conflicts, and malformed sync messages.

3. Usability - Score: 7/10
Weaknesses: Overload-heavy API can be confusing; multiple entrypoints increase learning cost.
Strengths: Rich APIs for sync, persist, async, and React; extensive docs.
Production Risks: Incorrect API usage leading to runtime errors or subtle bugs.
Improvement Suggestions: Add opinionated wrappers or presets for common usage patterns.

4. Flexibility - Score: 8/10
Weaknesses: Flexibility can blur safety boundaries and increase surface area.
Strengths: Feature registry and optional layers enable tailoring to app needs.
Production Risks: Teams may enable features without full understanding of side effects.
Improvement Suggestions: Provide feature compatibility matrix and recommended profiles.

5. Scalability - Score: 6/10
Weaknesses: deepClone snapshots and hashing are O(n) per update in worst cases.
Strengths: Chunked notification delivery and async caching help under load.
Production Risks: Large stores or frequent updates can cause performance cliffs.
Improvement Suggestions: Offer structural sharing and selective snapshotting options.

6. Low Redundancy - Score: 6/10
Weaknesses: Similar logic appears across persist and sync layers.
Strengths: Shared utilities for validation, hashing, and cloning.
Production Risks: Divergent behavior between features and increased maintenance cost.
Improvement Suggestions: Extract shared state normalization and versioning helpers.

7. High Cohesion / Loose Coupling - Score: 7/10
Weaknesses: Global registry is a hidden coupling point; features reach into internals via hooks.
Strengths: Clear boundaries between core lifecycle, notify, and features.
Production Risks: Feature changes can have unintended side effects across the system.
Improvement Suggestions: Add a stricter internal API boundary for feature modules.

8. State Management Integrity - Score: 7/10
Weaknesses: Cross-feature ordering and time-based sync conflict resolution can still yield surprising outcomes.
Strengths: Validation, sanitize, and middleware pipelines enforce invariants.
Production Risks: Inconsistent state when multiple features contend over the same store within tight windows.
Improvement Suggestions: Document ordering guarantees and provide guidance for deterministic conflict resolution.

9. Security - Score: 5/10
Weaknesses: BroadcastChannel messages are unauthenticated; plaintext persistence is default.
Strengths: Optional encryption for persisted data; sync protocol versioning.
Production Risks: Data leakage across tabs or malicious injections in shared origin contexts.
Improvement Suggestions: Add optional message signing and safer defaults for persistence.

10. Efficiency - Score: 6/10
Weaknesses: deepClone for snapshots and full-state hashing can be expensive.
Strengths: Batching, chunking, and cache pruning reduce hot-path pressure.
Production Risks: CPU spikes with large stores or high-frequency updates.
Improvement Suggestions: Add configurable snapshot strategy and lightweight change detection.

11. Observability - Score: 7/10
Weaknesses: Limited production-grade telemetry hooks for metrics and tracing.
Strengths: Diagnostics, devtools hooks, and verbose warnings.
Production Risks: Harder to pinpoint issues under production load.
Improvement Suggestions: Provide structured event hooks or metrics callbacks.

12. Integration Design - Score: 7/10
Weaknesses: Integration patterns for other frameworks are not first-class.
Strengths: React hooks and server utilities are built-in and cohesive.
Production Risks: Teams may write ad-hoc wrappers with inconsistent behavior.
Improvement Suggestions: Publish official adapters for other UI frameworks.

13. Goal-Oriented Design - Score: 7/10
Weaknesses: The breadth of features can blur the primary mental model.
Strengths: Clear focus on predictable state updates and operational features.
Production Risks: Teams use the library as a Swiss army knife and drift from core philosophy.
Improvement Suggestions: Provide layered documentation from core to advanced.

14. Feedback Loops - Score: 6/10
Weaknesses: Several error paths rely on warnings rather than structured, typed errors.
Strengths: OnError hooks and warnings catch many misuses.
Production Risks: Debugging incidents consumes time with limited telemetry.
Improvement Suggestions: Ensure all errors are routed through a single reporting channel.

15. Continuous Improvement Readiness - Score: 7/10
Weaknesses: Commit history shows high churn with frequent status-only updates.
Strengths: CI workflows, extensive docs, and test suite present.
Production Risks: APIs may shift without stable deprecation windows.
Improvement Suggestions: Adopt semantic versioning and explicit deprecation cycles.

16. Documentation - Score: 8/10
Weaknesses: It is long and dense; quick-start and architecture summary are harder to find.
Strengths: Very extensive docs and conceptual material in `docs_2.0`.
Production Risks: Teams may not read enough to use advanced features safely.
Improvement Suggestions: Add a concise architecture overview and a checklist for production use.

17. Fail Gracefully - Score: 6/10
Weaknesses: Some failure modes are only warned and not surfaced as structured errors (for example sync protocol mismatch, plaintext persist).
Strengths: Many paths return structured results and avoid throwing.
Production Risks: Unhandled runtime exceptions under edge conditions.
Improvement Suggestions: Harden error paths and provide structured error types for feature failures.

18. Honesty of Abstractions - Score: 7/10
Weaknesses: Some abstractions hide performance costs (deepClone snapshots, hashing).
Strengths: Internal layers are clearly separated; naming is direct.
Production Risks: Teams may assume cheap updates when they are not.
Improvement Suggestions: Document performance characteristics near the APIs.

PHASE 3 - TYPE SYSTEM AND DX

Type safety:
Strict TypeScript is enabled (`tsconfig.json` uses `strict` and `noImplicitAny`). StoreDefinition generics are strong for registered stores.

Type inference:
Good for store definitions and selectors, weaker when using unregistered store names or dynamic path strings.

Strict mode compliance:
TypeScript config is strict, but runtime code uses `as any` in several internal paths.

API ergonomics:
Powerful overloads for setStore, hooks, and async helpers. The overload count is high, which increases ambiguity and misuse risk.

Developer experience:
Good diagnostics and large documentation set. The public API is wide and can be overwhelming without a guided path.

Does the type system prevent misuse?
Partially. It prevents many invalid store and path accesses for registered stores, but unregistered store overloads and string paths allow bypassing compile-time safety.

Unsafe casts / hidden any / inference leaks (examples):
1. `src/async-fetch.ts:175` uses `(urlOrRequest as any)` to detect Promise-like inputs.
2. `src/async-cache.ts:16` uses `(getter() as any)[prop]` in a Proxy handler.
3. `src/async-cache.ts:18` uses `(getter() as any)[prop] = value` in a Proxy handler.
4. `src/devfreeze.ts:5` uses `(value as any).$$typeof` to detect React elements.

PHASE 4 - ARCHITECTURAL INTEGRITY

Layer violations:
The feature layers (`src/features/*`) reach into core lifecycle via hook contexts. This is intentional but creates hidden coupling through the shared registry.

Hidden coupling:
Global registry singletons couple otherwise separate modules (notify, computed, async, persist) and make cross-feature side effects possible.

Circular dependencies:
No automated cycle analysis was run. Manual inspection of core modules did not show an obvious direct cycle, but this is not a guarantee.

Architecture drift:
The system is modular, but feature growth has expanded the surface area and complexity of core contracts.

Accidental complexity:
Overload-heavy APIs, extensive feature flags, and multiple entrypoints increase complexity beyond what core store management requires.

Abstraction leaks:
Performance characteristics of snapshotting and hashing leak into user code through unexpected CPU cost on updates.

Architecture stability assessment:
Stable long-term if feature scope is controlled. Currently moderately fragile due to global singleton coupling and multi-layer feature interactions. It is not overengineered, but it is trending toward complexity and needs stronger guardrails.

PHASE 5 - REAL WORLD FUNCTIONALITY

Runtime validation:
`sanitizeValue`, `validatePathSafety`, and `normalizeCommittedState` enforce runtime safety for data and paths. Errors are surfaced via `onError` hooks and warnings.

Edge case handling:
Many code paths handle invalid input explicitly, but sync conflict resolution remains time-based and cross-feature ordering can still surprise.

Error boundaries:
Diagnostics exist, but there is no centralized error boundary or structured error type for all failures.

Backwards compatibility:
Compatibility aliases exist (for example `getSnapshot` and `subscribeInternal`), and hash stability is preserved in `hashState` for string inputs.

Migration strategy:
Persist supports versioning and migrations with `onMigrationFail` handling in `src/features/persist`.

Commit history evaluation:
From the last 95 commits, 93 include `status(...)` messages, 11 include fix or bug keywords, and 6 include refactor keywords. This indicates high churn and frequent status-driven updates with periodic fixes and refactors.

PHASE 6 - FAILURE ANALYSIS (TOP 10 MOST LIKELY PRODUCTION FAILURES)

1. Computed cleanup is not run when computed stores are deleted
File: `src/internals/store-admin.ts:149`
Line numbers: 149, 150, 151
Snippet:
```ts
149:             if (isComputed(name)) {
150:                 deleteComputed(name);
151:             }
```
Supporting snippet:
File: `src/computed.ts:69`
Line numbers: 69, 70, 71, 72
```ts
69:     getComputedCleanups().set(name, () => {
70:         unsubscribers.forEach((fn) => fn());
71:         unregisterComputed(name);
72:     });
```
Explanation:
Computed stores register cleanup functions that unsubscribe from dependencies, but `deleteExistingStore` only calls `unregisterComputed`, which removes the graph entry without invoking cleanup. This leaves subscriptions alive and can cause memory leaks and redundant recomputation.
Fix recommendation:
Call `deleteComputed(name)` (or run the cleanup from `computedCleanups`) inside `deleteExistingStore` when a computed store is removed.
Status: Fixed in current patch by invoking `deleteComputed(name)` during store deletion.

2. setStore can throw when called on a missing store
File: `src/store-write.ts:189`
Line numbers: 189, 191, 192, 194, 198, 303, 304, 313, 314
Snippet:
```ts
189: export function setStore(name: string | StoreDefinition<string, StoreValue>, keyOrData: KeyOrData, value?: unknown): WriteResult {
191:     if (!materializeInitial(storeName)) return { ok: false, reason: "validate" };
192:     if (!hasStoreEntryInternal(storeName)) {
194:         const message =
198:         return { ok: false, reason: "not-found" };
303:             meta[storeName].updatedAt = new Date().toISOString();
304:             meta[storeName].updateCount++;
313:         meta[storeName].updatedAt = new Date().toISOString();
314:         meta[storeName].updateCount++;
}
```
Supporting snippet:
File: `src/store-lifecycle/validation.ts:283`
Line numbers: 283, 284, 285
```ts
283:     if (stores[name] !== undefined) return true;
284:     const factory = initialFactories[name];
285:     if (!factory) return true;
```
Explanation:
`setStore` does not require the store to exist, and `materializeInitial` returns true even when no store or factory exists. Later, `meta[storeName]` is accessed without null guards, which can throw a TypeError. This is a crash path rather than a controlled error.
Fix recommendation:
Add a missing-store guard in `setStore` (return `{ ok: false, reason: "not-found" }`), or create the store automatically in a documented way.
Status: Fixed in current patch by guarding on `hasStoreEntryInternal` and returning `not-found`.

3. Path validation cache must be invalidated when feature-applied state is used (now fixed in feature context)
File: `src/store-lifecycle/hooks.ts:83`
Line numbers: 83, 84, 85
Snippet:
```ts
83:         applyFeatureState: (value: StoreValue, updatedAtMs?: number) => {
84:             applyFeatureState(name, value, updatedAtMs);
85:             invalidatePathCache(name);
```
Explanation:
Previously, feature-applied state updates (persist and sync) could leave cached path safety verdicts stale if the store shape changed. The base feature context now invalidates the path cache whenever feature state is applied.
Fix recommendation:
Invalidate path cache when applying feature state.
Status: Fixed in current patch by invalidating path cache in the base feature context.

4. BroadcastChannel sync messages are unauthenticated
File: `src/features/sync.ts:205`
Line numbers: 205, 206, 207, 208, 209, 214, 215
Snippet:
```ts
205:         channel.onmessage = (event: MessageEvent) => {
206:             const msg = event.data as any;
207:             if (!msg || msg.source === instanceId) return;
208:             if (msg.name !== name) return;
209:             if (syncChannels[name] !== channel || !hasStoreEntry(name) || !getMeta(name)) return;
214:             const incomingVersion = resolveProtocolVersion(msg);
215:             if (incomingVersion !== SYNC_PROTOCOL_VERSION) {
```
Explanation:
Any same-origin tab can send valid sync messages on the channel. There is no authentication or signature, which allows injection or corruption in untrusted environments.
Fix recommendation:
Add optional signing or a shared secret in message payloads, or allow users to provide a validation callback.

5. Persistence defaults to plaintext encryption
File: `src/adapters/options.ts:242`
Line numbers: 242, 243, 244
Snippet:
```ts
242:         encrypt: markDefaultPersistCrypto((v: string) => v),
243:         decrypt: markDefaultPersistCrypto((v: string) => v),
244:         sensitiveData: false,
```
Supporting snippet:
File: `src/features/persist/save.ts:43`
Line numbers: 43, 46, 47
```ts
43:         if (!plaintextWarningsIssued.has(name) && usesDefaultPersistCrypto(cfg.encrypt) && usesDefaultPersistCrypto(cfg.decrypt)) {
46:                 `[stroid/persist] Store '${name}' is persisted in plaintext. ` +
47:                 `Provide encrypt/decrypt hooks to protect sensitive data.`;
```
Explanation:
The default behavior persists data in plaintext with only a warning. This is a security risk if developers miss the warning in production.
Fix recommendation:
Make non-plaintext persistence opt-out with explicit acknowledgement in production builds.

6. Async fetch auto-creates stores on typos
File: `src/async-fetch.ts:193`
Line numbers: 193, 196, 197, 201, 202
Snippet:
```ts
193:         if (isDev() && !autoCreateWarned.has(name)) {
196:             const message =
197:                 `fetchStore("${name}") auto-created its backing store.\n` +
201:         createStore(name, {
202:             data: null,
```
Explanation:
A misspelled store name causes a new store to be created, leading to phantom stores and memory growth in long-lived applications.
Fix recommendation:
Require explicit creation in production or provide a strict mode that throws when auto-create happens.

7. Async fetch stores transformed data by reference
File: `src/async-fetch.ts:359`
Line numbers: 359, 376, 379, 384, 385
Snippet:
```ts
359:                 const transformed = transform ? transform(result) : result;
376:                 cacheMeta[cacheSlot] = {
379:                     data: transformed,
384:                     setStore(name, {
385:                         data: transformed,
```
Explanation:
Transformed objects are cached and stored by reference without cloning or freezing in production. External mutation can corrupt cached and stored state.
Fix recommendation:
Clone or freeze transformed data, or document the immutability requirement explicitly.

8. Snapshot creation deep clones on every update
File: `src/store-notify.ts:110`
Line numbers: 110, 111, 114, 115
Snippet:
```ts
110:             const cached = snapshotCache[name];
111:             const snapshot = (cached && cached.version === version)
114:                     const nextSnapshot = deepClone(stores[name]);
115:                     snapshotCache[name] = { version, snapshot: nextSnapshot };
```
Explanation:
Every update can trigger a deep clone to build snapshots. With large stores or frequent updates, this creates CPU and memory pressure.
Fix recommendation:
Allow configurable snapshot strategies or structural sharing to avoid full deep clones.

9. Full-state hashing can be expensive for large stores
File: `src/utils.ts:69`
Line numbers: 69, 111, 112, 222, 226, 233
Snippet:
```ts
69: const MAX_HASH_NODES = 100_000;
111: const hashValue = (state: HashState, value: unknown): void => {
112:     if (state.nodes++ > MAX_HASH_NODES) {
222: export const hashState = (value: unknown): number => {
226:     const state: HashState = {
233:     hashValue(state, value);
```
Explanation:
The checksum traverses the full object graph up to 100k nodes. For large state trees, this can be a significant cost during persist/sync.
Fix recommendation:
Make hashing optional or incremental; consider hashing only the parts that changed.

10. Sync conflict resolution depends on local and incoming timestamps
File: `src/features/sync.ts:237`
Line numbers: 237, 238, 243, 244, 250
Snippet:
```ts
237:                 const localUpdated = new Date(getMeta(name)?.updatedAt || 0).getTime();
238:                 const incomingUpdated = msg.updatedAt;
243:                         localUpdated,
244:                         incomingUpdated,
250:                         const resolvedUpdatedAt = Math.max(Date.now(), localUpdated, incomingUpdated);
```
Explanation:
Conflict resolution depends on timestamps that can be skewed across devices or tabs, which can lead to non-deterministic resolution under clock drift.
Fix recommendation:
Prefer logical clocks or vector clocks, or require the resolver to be deterministic and independent of wall time.
POTENTIALLY INTENTIONAL DESIGN -- NEEDS CONFIRMATION

PHASE 7 - BUG HUNT MODE (ADVERSARIAL)

Confirmed bug 1: Computed cleanup not invoked on deleteStore
File: `src/internals/store-admin.ts:149`
Line numbers: 149, 150, 151
Snippet:
```ts
149:             if (isComputed(name)) {
150:                 deleteComputed(name);
151:             }
```
Supporting snippet:
File: `src/computed.ts:69`
Line numbers: 69, 70, 71, 72
```ts
69:     getComputedCleanups().set(name, () => {
70:         unsubscribers.forEach((fn) => fn());
71:         unregisterComputed(name);
72:     });
```
Reasoning:
The computed cleanup map is populated but never invoked when a computed store is deleted via `deleteStore` or `clearAllStores`. This leaves dependency subscriptions active.
Production impact:
Memory leaks and redundant recomputation across deleted computed stores.
Fix:
Invoke `deleteComputed(name)` or run the cleanup directly during store deletion.
Status: Fixed in current patch by invoking `deleteComputed(name)` in `store-admin`.

Confirmed bug 2: setStore can crash when store does not exist
File: `src/store-write.ts:189`
Line numbers: 189, 191, 192, 194, 198, 303, 304, 313, 314
Snippet:
```ts
189: export function setStore(name: string | StoreDefinition<string, StoreValue>, keyOrData: KeyOrData, value?: unknown): WriteResult {
191:     if (!materializeInitial(storeName)) return { ok: false, reason: "validate" };
192:     if (!hasStoreEntryInternal(storeName)) {
194:         const message =
198:         return { ok: false, reason: "not-found" };
303:             meta[storeName].updatedAt = new Date().toISOString();
304:             meta[storeName].updateCount++;
313:         meta[storeName].updatedAt = new Date().toISOString();
314:         meta[storeName].updateCount++;
}
```
Supporting snippet:
File: `src/store-lifecycle/validation.ts:283`
Line numbers: 283, 284, 285
```ts
283:     if (stores[name] !== undefined) return true;
284:     const factory = initialFactories[name];
285:     if (!factory) return true;
```
Reasoning:
`setStore` allows unregistered store names but later assumes `meta[storeName]` exists. If no store or factory is registered, this produces a TypeError.
Production impact:
Unhandled exception on user error or timing bugs, taking down the write path.
Fix:
Add a missing-store guard or auto-create behavior consistent with the type overloads.
Status: Fixed in current patch by guarding on `hasStoreEntryInternal` and returning `not-found`.
POTENTIALLY INTENTIONAL DESIGN -- NEEDS CONFIRMATION

PHASE 8 - TEST SUITE AUDIT

Test structure:
Tests are organized by feature in `tests/` with heavy/perf scenarios under `tests/heavy` and type tests under `tests/types`.

Test coverage:
Core store operations, async fetching, persistence, sync, React hooks, SSR behaviors, and regression cases are covered. Heavy tests cover stress and memory scenarios.

Test quality:
Assertions are targeted and cover many operational pathways. Some edge cases and failure modes are missing tests.

Edge case coverage:
Limited for missing-store error handling and computed deletion cleanups (both now implemented but still untested).

Regression protection:
Good for known regressions; missing for some high-risk edge cases noted below.

Maintainability:
Tests are readable and separated by concern; heavy tests can be time-consuming but are isolated.

Testing tooling:
Uses Node test runner with setup hooks; type tests exist for public API.
New tests added:
Feature-applied state invalidation, sync conflict resolution, and malformed sync message rejection.

Testing quality score: 7/10

Critical behaviors not tested:
1. deleteStore of computed stores should clean up dependency subscriptions (now implemented, still untested).
2. setStore on a missing store should return a controlled error (now implemented, still untested).

Edge cases missing:
1. BroadcastChannel spoofed messages for sync (malformed message rejection is now tested).
2. Persist warnings for plaintext in production mode.
3. Large-state performance under frequent updates with snapshot and hash paths.

Race conditions not tested:
1. Concurrent async fetches with rapid abort and retry interactions.
2. Sync conflict resolution under rapid version updates.

PHASE 9 - DESIGN COMPARISON

Compared to Redux:
Stroid is less ceremony-heavy and provides built-in async, persist, and sync. Redux has a more rigid single-directional data flow and a larger ecosystem for middleware.

Compared to Zustand:
Stroid offers richer built-in features and validation, but Zustand is simpler and lighter-weight with fewer global concerns.

Compared to Jotai:
Stroid is centralized and store-based, while Jotai is fine-grained and atom-based. Stroid is easier for global state, Jotai scales better to fine-grained updates.

Compared to Valtio:
Valtio uses proxy-based mutation and reactive tracking. Stroid is more explicit and predictable, but less ergonomic for direct mutations.

Compared to Signals:
Signals provide very fine-grained reactivity. Stroid is coarser-grained and may be less efficient for large UI graphs.

Where this design is superior:
A cohesive set of operational features (persist, sync, devtools, async) with consistent API and strong runtime validation.

Where it is weaker:
Performance under large-scale state updates and the complexity introduced by a global registry and feature surface area.

Where it reinvents solved problems:
Async data lifecycle, persistence, and sync overlap with existing libraries such as React Query, SWR, or Redux middleware ecosystems.

PHASE 10 - FINAL VERDICT

OVERALL SCORE (1-10): 6.7

Is this production ready?
Conditionally. The core is solid, but two confirmed bugs and several performance and security risks must be addressed before high-scale production usage.

Would you adopt this in a serious system?
Yes for controlled scopes with guardrails and fixes, not yet for large multi-team systems without the recommended hardening.

Biggest risks:
Unauthenticated sync messages, plaintext persistence defaults, and performance cliffs from deepClone and hashing.

Strongest ideas:
Layered architecture with opt-in features, thorough runtime validation, and comprehensive documentation.

3 Brutal Truths about the project.
1. The global registry is a single point of coupling that makes cross-feature side effects hard to reason about.
2. Performance costs scale with state size more than the API surface suggests.
3. The feature breadth increases maintenance and test burden faster than new capabilities justify.








