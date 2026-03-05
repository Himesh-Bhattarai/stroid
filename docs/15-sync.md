# Chapter 15 — Sync

> *"Same state. Every tab. Always."*

---

## Import

```js
import { sync } from "stroid/sync"
```

---

## Basic — BroadcastChannel

```js
// State syncs across all tabs automatically
sync("cart")
sync("notifications")
```

When a user updates state in one tab, all other open tabs update instantly.

---

## WebSocket — Cross Device

```js
sync("messages", {
  adapter: "websocket",
  url: "wss://your-server.com/sync"
})
```

For real-time sync across devices and users.

---

## Custom Adapter

```js
sync("user", {
  adapter: {
    send: (storeName, patch) => myTransport.emit(storeName, patch),
    receive: (callback) => myTransport.on("patch", callback)
  }
})
```

---

## Conflict Resolution

When two tabs update the same field simultaneously:

```js
sync("document", {
  conflictResolver: (local, remote) => {
    // Return the version to keep
    return local.updatedAt > remote.updatedAt ? local : remote
  }
})
```

Default strategy is Last Write Wins (LWW).

---

**[← Chapter 14 — Persistence](./14-persist.md)** · **[Chapter 16 — Middleware →](./16-middleware.md)**