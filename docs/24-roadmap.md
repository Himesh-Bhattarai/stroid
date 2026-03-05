# Chapter 24 — Roadmap

> *"Where stroid is going."*

---

## v0.1.0 — Stable Foundation
*Current focus*

- Fix all known bugs (15 open issues)
- New core API — `isGlobal`, `isTemp`
- `setStore` shallow merge default
- `setStore.replace` for explicit replacement
- Remove immer-style draft mutations
- Modular subpath imports
- `stroid-test` as separate package
- `stroid-devtools` as separate package
- Bundle target: < 8KB gzip
- Full TypeScript coverage

---

## v0.2.0 — Modular Core

- `stroid/core` — pure, zero dependency
- `stroid/react` — React hooks isolated
- `stroid/async` — async query helpers
- `stroid/persist` — persistence adapters
- `stroid/sync` — BroadcastChannel + WebSocket
- `stroid/middleware` — extensible pipeline
- `stroid/schema` — validation layer
- `stroid/ssr` — SSR/RSC helpers

---

## v1.0.0 — Production Ready

- API locked — no breaking changes after this
- Full documentation (this book)
- Real world examples
- Performance benchmarks
- Community feedback incorporated

---

## v2.0 — Intelligence Layer

- State relationships — `relate()` — stores that react to each other
- State confidence — know if your data is fresh or stale
- Time aware state — TTL, expiry, scheduled updates
- Intent based updates — log WHY state changed
- Unified async — server and client state one model
- WebSocket sync adapter

---

## v3.0 — Universal Platform

- Cross framework — Vue, Svelte, Angular bindings
- Collaborative state — CRDT, multi-user real-time
- Edge state — Cloudflare Workers, Vercel Edge
- Queryable state — filter/sort/aggregate your state
- State replay — record and replay user sessions

---

## v4.0 — Pipeline State

- One store flows through entire stack
- Frontend → Middleware → Controller → DB
- Optimistic updates with automatic rollback
- Offline first with intelligent sync on reconnect
- Universal — same store, same API, client to server

---

## Versioning Policy

Stroid follows semantic versioning.

```
0.x.x  →  pre-stable, breaking changes allowed
1.x.x  →  stable, breaking changes only on major
```

Until v1.0.0 — breaking changes bump the minor version (`0.x.0`). After v1.0.0 — breaking changes only happen on major version bumps.

---

## Contributing

Stroid is open source. Contributions, bug reports, and feature discussions are welcome on GitHub.

---

**[← Chapter 23 — Migration](./23-migration.md)** · **[Back to Table of Contents →](./README.md)**