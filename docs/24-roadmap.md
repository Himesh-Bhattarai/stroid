# Chapter 24 -- Roadmap

> "Where stroid is going (subject to change)."

---

## Current (v0.0.3)

- Solidify core APIs (create/set/merge/reset/get).
- Stabilize persistence, schema, middleware, sync, history, metrics, devtools.
- Improve docs and examples for helpers (counter/list/entity stores, chain).

---

## Near-Term Candidates (not guaranteed)

- Store lifetime flags (`isGlobal`, `isTemp`).
- `setStore.replace` helper and tuple-style `setStoreBatch`.
- Higher-level async helpers (`createQuery`, request-store conveniences).
- Dedicated subpaths for `persist`, `sync`, `middleware`, `schema`, `ssr`.
- Remote sync adapters (WebSocket) beyond BroadcastChannel.

These items are under active discussion and may land or be deferred based on feasibility and community feedback.

---

## Longer-Term Ideas

- Cross-framework bindings (Vue/Svelte/Angular).
- Advanced relationship APIs (derived/relational stores).
- Offline/rollback pipelines and richer observability.

---

## Versioning

Semantic versioning applies. Until v1.0.0, breaking changes can occur on minor bumps.

---

**[<- Chapter 23 -- Migration](./23-migration.md) :: [Back to Table of Contents ->](./README.md)**
