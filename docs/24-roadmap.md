# Chapter 24 -- Roadmap

> "What ships now, what is promised for 1.0."

---

## Where We Are (v0.0.3)

- Current codebase: create/set/merge/reset/get, persistence, middleware, schema, sync (BroadcastChannel), devtools flag, async helpers (`fetchStore`), testing helpers.
- Docs now match the code; anything not listed below is intentionally not shipped yet.

---

## Committed Milestones

- **v0.1.0 -- Fix and stabilize**
  - Close remaining 15 issues; stabilize existing API surface.
- **v0.2.0 -- Core cleanup**
  - Remove Immer traces, add `isGlobal`/`isTemp`, add `setStore.replace`, tighten core API.
- **v0.3.0 -- Modular subpaths**
  - Publish dedicated entry points: `stroid/core`, `stroid/react`, `stroid/async`, `stroid/persist`, `stroid/sync`, `stroid/devtools`.
- **v0.4.0 -- Testing + DX**
  - Ship `stroid/testing`, better warnings, devtools stable, full TypeScript coverage.
- **v0.5.0 -- Performance + Size**
  - Bundle target < 8KB gzip, tree-shakeable confirmed, zero regressions.
- **v0.6.0 -- Docs + Examples**
  - Complete documentation set, real-world examples, migration guides.
- **v0.7.0 -- Community beta**
  - Open feedback channel, early adopters, bug reports.
- **v0.8.0 -- Stability hardening**
  - Address community bugs, edge cases, confirm SSR/RSC paths.
- **v0.9.0 -- Release candidate**
  - API locked, no more breaking changes, final docs pass.
- **v1.0.0 -- STABLE**
  - Everything above delivered; missing features today are promised by this point.

---

## Promise to v1.0.0

If a feature is listed above but absent in the current code (e.g., `isGlobal`, `setStore.replace`, dedicated subpaths), it is planned and tracked for delivery by 1.0. Until then, the docs only claim what exists today.

---

## Versioning

Semantic versioning applies. Pre-1.0 releases may introduce breaking changes on minor bumps; 1.0+ locks the API.

---

**[<- Chapter 23 -- Migration](./23-migration.md) :: [Back to Table of Contents ->](./README.md)**
