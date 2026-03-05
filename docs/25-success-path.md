# Stroid Success Path (Working Draft)

Goal: become a reliable, lightweight global state system with guardrails and great DX, delivered on time to v1.0 without scope creep.

---

What we must do (in order)
1) Stabilize the core (v0.0.4):
   - Close all open 0.0.3 issues; add regression tests for persistence, sync, schema, batching, async.
   - Keep bundle <8KB gzipped; ensure optional features tree-shake.
2) Core cleanup (v0.0.5):
   - Add `isGlobal` / `isTemp`, `setStore.replace`, finish Immer removal, tighten path safety.
3) Modular subpaths (v0.0.6):
   - Ship `stroid/core`, `stroid/react`, `stroid/async`, `stroid/persist`, `stroid/sync`, `stroid/devtools`.
4) DX + tooling (v0.0.7):
   - Solid Redux DevTools integration, clearer warnings, full TypeScript coverage, `stroid/testing` ready.
5) Performance & size (v0.0.8):
   - Prove render counts stay minimal (path subscriptions); confirm bundle size and tree-shakeability in CI.
6) Docs & examples (v0.0.9):
   - One-page quickstart, migration (Redux/Zustand), production-shaped examples: auth, cart, SSR hydrate, cross-tab sync, optimistic async.
7) Beta hardening (v0.0.10–0.0.12):
   - Soak tests: storage corruption, abortable async retries, schema migrations, cross-tab conflicts.
   - Lock API, fix edge cases, prepare RC.
8) v1.0:
   - API locked; no breaking changes without semver major.

Guardrails (do not slip)
- No new dependencies unless zero-cost for bundle/TS.
- Every feature behind an option; defaults stay lean.
- Tests for every bug fix to prevent regressions.
- Abort/validation errors must not mutate state or metrics.
- Warnings must be actionable and rate-limited.

Positioning (how we explain value)
- “Global store with dot-path ergonomics + built-in guardrails (schema/validator/middleware) + async/persist/sync included, no provider, <8KB.”
- Three-call story: createStore -> setStore -> useStore.
- Works with React; usable without React; optional compat shim for Zustand patterns.

Proof we’re done
- Bundle size and tree-shake checks pass in CI.
- Devtools works reliably with set/merge/reset/delete, history/metrics accurate.
- Cross-tab sync survives conflicts; persistence survives corrupt data.
- SSR/RSC hydrate/dehydrate paths verified.
- Docs match code; examples run end-to-end.

Nice-to-haves (after v1)
- Relationship/CRDT/predictive state, remote sync adapters.
- Community programs once API is locked (no “help wanted” until then).
