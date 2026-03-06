# Chapter 24 -- Roadmap

> "What ships now, what is promised for 1.0."

---

## Baseline (v0.0.4)

- Current: create/set/merge/reset/get, persistence with recovery hooks, middleware, schema, sync (BroadcastChannel) with payload guards/catch-up, devtools flag, async helpers (`fetchStore`), React hooks, and testing helpers.
- 0.0.4 is the stabilization release for the 0.0.3 line: hydration, middleware, persistence, async cleanup, and sync edge cases are covered here.
- Docs match code; anything below is not shipped yet.

---

## Next Releases (starting at v0.0.5 -> v1.0.0)

1) **v0.0.5 -- Core cleanup**  
   Remove Immer traces, add `isGlobal`/`isTemp`, add `setStore.replace`, tighten core API.
2) **v0.0.6 -- Modular subpaths**  
   Publish dedicated entry points: `stroid/core`, `stroid/react`, `stroid/async`, `stroid/persist`, `stroid/sync`, `stroid/devtools`.
3) **v0.0.7 -- Testing + DX**  
   Ship `stroid/testing`, better warnings, devtools stable, full TypeScript coverage.
4) **v0.0.8 -- Performance + Size**  
   Bundle target < 8KB gzip, tree-shakeable confirmed, zero regressions.
5) **v0.0.9 -- Docs + Examples**  
   Complete documentation set, real-world examples, migration guides.
6) **v0.0.10 -- Community beta**  
   Open feedback channel, early adopters, bug reports.
7) **v0.0.11 -- Stability hardening**  
   Address community bugs, edge cases, confirm SSR/RSC paths.
8) **v0.0.12 -- Release candidate**  
   API locked, no more breaking changes, final docs pass.
9) **v1.0.0 -- STABLE**  
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
