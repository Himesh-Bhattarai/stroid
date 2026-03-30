# Migrating from Movex

> **Comparison:** Movex vs Stroid &nbsp;|&nbsp; **Last Updated:** 2026-03-29
>
> *Help migrating from Movex to Stroid*

---

## 📚 Table of Contents

- [About Movex](#-about-movex)
- [Conceptual Differences](#-conceptual-differences)
- [Compute Strategy](#-compute-strategy)
- [Synchronization](#-synchronization)
- [Common Patterns](#-common-patterns)

---

## ℹ️ About Movex

**Movex** is a specialized library for distributed, realtime state management with compute on the server.

**Stroid** is a **local-first state engine** with optional sync, persistence, and async caching.

---

## 🧭 Conceptual Differences

| Aspect | Movex | Stroid |
|--------|-------|--------|
| **Authority** | Server (resolver pattern) | Client-first (local writes) |
| **Compute** | Server-side resolver | Client-side or via API |
| **Sync** | Built-in realtime | Optional via `sync` module |
| **Offline** | Server-authoritative | Works offline, syncs when online |

---

## 🎯 Compute Strategy

### Movex (Server-Driven)

```ts
createMovexServer({
  "counter": (actionType, state, payload) => {
    if (actionType === "INCREMENT") {
      return { ...state, count: state.count + 1 }
    }
  }
})

useMovex("counter").dispatch("INCREMENT")
```

### Stroid (Client-First + API)

```ts
createStore("counter", { count: 0 })

setStore("counter", (draft) => {
  draft.count += 1
})
```

---

## 🔄 Synchronization

### Movex (Realtime Server Sync)

```ts
const [state, dispatch] = useMovex("sharedState")
```

### Stroid (Opt-In Sync)

```ts
import { sync } from "stroid/sync"

sync({
  channel: "state-sync",
  stores: ["counter"],
})
```

---

## 📚 Documentation

- [Async Guide](../STROID_ASYNC/INDEX.md)
- [Sync Module](../STROID_SYNC/INDEX.md)
- [Core Concepts](../STROID_CORE/INDEX.md)
