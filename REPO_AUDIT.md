# Repo Audit Responses (March 10, 2026)

This file answers the outstanding questions from the latest BUG_REPORT items. Each entry states whether it is fixed, why/why not, and next steps.

| Item | Status | Rationale / What changed | Next step |
| --- | --- | --- | --- |
| 1) `refetchStore` with Promise input replays settled Promise | **Fixed** | When `fetchStore` is called with a Promise, we no longer cache that Promise for refetch; `_fetchRegistry` is only populated for URL strings. `refetchStore` now warns and returns instead of replaying stale data (`src/async.ts`). | If you want refetch support for Promise inputs, introduce a `() => Promise` factory API. |
| 2) Double validation on every write | **Fixed** | Pre‑middleware schema/validator pass was removed; sanitize happens before middleware, full validation only after middleware (`src/store.ts`). | Add a regression test to lock the single‑pass behavior. |
| 3) Critical events hidden by `warn()` in production | **Partially fixed** | Added `critical` sink that always fires; path safety, store errors, and sync protocol mismatches now use it. Some remaining call sites still use `warn` (e.g., size/clamp advisories). | Sweep remaining critical paths (maxPayloadBytes drop, schema failure in features) to ensure they call `critical`/`onError`. |
| 4) `subscribeWithSelector` first-call spurious listener | **Fixed** | First notification now just seeds `prevSel`; listener is not called until a real change occurs (`src/selectors.ts`). | Add test to ensure no initial double-fire. |
| 5) Async module state not registry-scoped | **Fixed** | All async metadata is now keyed per store registry scope; dedupe tracking carries raw+transform to prevent cross-scope bleed (`src/async.ts`). | None. |
| 6) `setStoreBatch` notifies before throwing on async detection | **Fixed** | Pending notifications are cleared if the callback returns a Promise, preventing partial leaks before the throw (`src/store.ts`). | Optional: capture/restore pending set instead of clearing to preserve queued updates. |
| 7) `enableRevalidateOnFocus("*")` blasts all stores | **Fixed/Configurable** | Added debounce (500 ms default), maxConcurrent (3), and stagger (100 ms) with global config overrides (`src/async.ts`, `src/internals/config.ts`). | Expose per-call overrides if needed; add metrics to tune defaults. |
| 8) Async-function guard bypassable in `setStoreBatch` | **Not fixed** | The `constructor.name === "AsyncFunction"` pre-check remains. The throw still occurs on returned Promise, but the guard is misleading. | Remove the constructor-name guard and rely solely on the return-value Promise check. |
| 9) `serializedSelectorEqual` unbounded JSON fallback | **Fixed** | Added cycle-safe stringify with 20k length cap; falls back to “not equal” when over limit (`src/selectors.ts`). | Consider removing fallback entirely if perf remains an issue. |
| 10) `import.meta.url` registry scoping brittle in bundles | **Not fixed** | Scope still derives from `import.meta.url`. No build-time override is present. | Add `STROID_REGISTRY_ID` (env/build flag) to force a stable scope when bundlers rewrite URLs. |

Other notes
- Checkbox “on” bug was already correct (`useFormStore` uses `checked` for checkboxes).
- Sync sanitize/validator parity and locale tiebreaker are still to be hardened; not addressed in this pass.
- No automated tests were run in this pass (previous `npm test` timed out). Add targeted tests before release. |

## Remaining Open Items (not fixed yet)

| Item | Status | Rationale / Why not fixed yet | Suggested next step |
| --- | --- | --- | --- |
| BroadcastChannel origin/message hardening | **Partially fixed** | Strict message shape validation added; still need deeper payload schema/signature if desired. | Consider optional allowlist or signed payloads. |
| Persist encryption warnings/requirements | **Partially fixed** | Warns on identity encrypt; critical if `sensitiveData` lacks encryption. | Enforce non-identity when `sensitiveData` true; add docs. |
| Namespace + lazy stores | **Partially fixed** | `listStores(pattern)` and `clearStores(pattern)` added; lazy initializers supported via `lazy` option. | Document namespace pattern; consider per-namespace tooling. |
| Priority flush & path-validation cache | **Fixed** | Priority store list in flush config and cached path validation with invalidation on writes. | Monitor perf; tune defaults if needed. |
| Docs consolidation | Open | Both `docs/` and `docs_2.0/` live. | Deprecate `docs/` with redirect; maintain `docs_2.0/`. |
| Generated types vs hand-written `index.d.ts` | **Fixed** | Hand-written shim removed; declarations generated from source via tsup/types config. | Ensure CI build emits dts. |
| CI tests/coverage/build on PR | Open | Workflow not added. | Add GitHub Action running test+coverage+build with threshold. |
| Write-result API / atomic batches | **Partially fixed** | `setStore`/`mergeStore` return `WriteResult`; atomic rollback still pending. | Add optional atomic batch mode. |
| Next.js/Suspense/CJS support | **Partially fixed** | CJS build enabled; Suspense hook added. Next helper still pending. | Ship `stroid/next` helper + docs. |
| deepClone Date warning | Open | Fallback clone still converts Date silently. | Warn or handle Dates explicitly in non-structuredClone path. |
