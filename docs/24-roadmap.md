# Chapter 24 -- Roadmap

> "What ships now, what is promised for 1.0."

---

## Baseline (v0.0.3)

- Current: create/set/merge/reset/get, persistence, middleware, schema, sync (BroadcastChannel), devtools flag, async helpers (`fetchStore`), testing helpers.
- Docs match code; nothing below is available yet. We start from here (no baggage from v0.0.1/v0.0.2).

---

## Next Releases (in order from v0.0.3 -> v1.0.0)

1) **v0.1.0 -- Fix and stabilize**  
   Close remaining 15 issues; stabilize existing API surface.
2) **v0.2.0 -- Core cleanup**  
   Remove Immer traces, add `isGlobal`/`isTemp`, add `setStore.replace`, tighten core API.
3) **v0.3.0 -- Modular subpaths**  
   Publish dedicated entry points: `stroid/core`, `stroid/react`, `stroid/async`, `stroid/persist`, `stroid/sync`, `stroid/devtools`.
4) **v0.4.0 -- Testing + DX**  
   Ship `stroid/testing`, better warnings, devtools stable, full TypeScript coverage.
5) **v0.5.0 -- Performance + Size**  
   Bundle target < 8KB gzip, tree-shakeable confirmed, zero regressions.
6) **v0.6.0 -- Docs + Examples**  
   Complete documentation set, real-world examples, migration guides.
7) **v0.7.0 -- Community beta**  
   Open feedback channel, early adopters, bug reports.
8) **v0.8.0 -- Stability hardening**  
   Address community bugs, edge cases, confirm SSR/RSC paths.
9) **v0.9.0 -- Release candidate**  
   API locked, no more breaking changes, final docs pass.
10) **v1.0.0 -- STABLE**  
    Everything above delivered; missing features today are promised by this point.

---

## Promise to v1.0.0

If a feature is listed above but absent in the current code (e.g., `isGlobal`, `setStore.replace`, dedicated subpaths), it is planned and tracked for delivery by 1.0. Until then, the docs only claim what exists today.

---

## Draft: v2.x Themes (post-1.0 exploration)

- **State Intelligence**
  - State relationships (stores that react to each other)
  - Time-aware state (TTL, expiry, scheduled updates)
  - State confidence/freshness indicators
  - Predictive state hooks (preload/optimistic hints)
- **State Collaboration**
  - Multi-user/state CRDT or conflict-free strategies
  - Shared editing sessions and replay
- **Ecosystem**
  - First-party `stroid-test` and `stroid-devtools` packages (optional installs; owned by Stroid)
  - Optional remote sync adapters

These are directional and not scheduled; they begin after v1.0.0 once stability is locked.

---

## Versioning

Semantic versioning applies. Pre-1.0 releases may introduce breaking changes on minor bumps; 1.0+ locks the API.

---

**[<- Chapter 23 -- Migration](./23-migration.md) :: [Back to Table of Contents ->](./README.md)**
