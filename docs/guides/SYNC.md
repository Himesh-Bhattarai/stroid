# Cross-Tab Sync Guide

> **Confidence: HIGH** — derived from `src/features/sync.ts`, `src/adapters/options.ts` (`SyncOptions`).

---

## Setup

Add a side-effect import **once** at app entry:

```ts
// main.tsx
import "stroid/sync"
```

Without this import, any store with `sync` options silently does nothing (or throws with `strictMissingFeatures: true`).

---

## Basic Usage

```ts
import { createStore } from "stroid"
import "stroid/sync"

createStore("presence", { online: true }, {
  sync: {
    channel:   "app-presence",
    authToken: "shared-secret",
  }
})
```

Any write to `"presence"` in one tab is broadcast to all other tabs with the same channel. Stale messages from closed or lagging tabs are automatically rejected via a Lamport clock.

---

## Security

By default, unauthenticated sync in production is **blocked**. To sync, you must provide one of:

- `authToken` — a shared secret checked on incoming messages
- `verify` — a custom verification function
- `policy: "insecure"` (or the deprecated `insecure: true`) — explicit opt-out of auth checking

```ts
// Strict auth (recommended)
sync: {
  channel:   "presence-sync",
  authToken: "app-shared-token",
}

// Custom verification
sync: {
  channel: "presence-sync",
  sign:    (msg) => hmac(msg, secret),
  verify:  (msg) => verifyHmac(msg, secret),
}

// Explicitly insecure (e.g., non-sensitive public UI state)
sync: {
  channel: "public-ui-sync",
  policy:  "insecure",
}
```

> **Security note:** BroadcastChannel is same-origin. If any tab is XSS-compromised, it can forge sync messages.  
> Use `authToken` or `verify` for meaningful protection.

---

## Conflict Resolution

Stroid uses Lamport clocks for conflict resolution. When two tabs write simultaneously, the message with the higher clock wins. You can provide a custom resolver:

```ts
sync: {
  channel: "presence",
  conflictResolver: ({ local, incoming, localUpdated, incomingUpdated }) => {
    // Return the value to use, or void to use the default (higher clock wins)
    return localUpdated > incomingUpdated ? local : incoming
  }
}
```

---

## Loop Guard

Prevents rapid feedback loops when a sync update triggers a local reaction that re-broadcasts.

`loopGuard` is **enabled by default** (100ms window). Disable it explicitly if you need immediate re-broadcast:

```ts
sync: {
  channel:   "presence",
  loopGuard: false,        // disable
  // or:
  loopGuard: { windowMs: 200 },  // custom window
}
```

---

## Payload Size Limit

```ts
sync: {
  channel:        "settings-sync",
  maxPayloadBytes: 64_000,  // messages exceeding this are rejected
}
```

---

## Checksum

```ts
sync: {
  channel:  "data-sync",
  checksum: "hash",   // default: include a payload checksum
  // or:
  checksum: "none",   // skip checksum generation
}
```

---

## Persist + Sync Together

```ts
import "stroid/persist"
import "stroid/sync"

createStore("settings", { theme: "dark" }, {
  persist: { key: "app-settings", allowPlaintext: true },
  sync:    { channel: "settings-sync", authToken: "token" },
})
// A write in one tab: saved to localStorage AND broadcast to all other tabs.
```

---

## Availability

Sync uses `BroadcastChannel`. Stroid warns and no-ops gracefully when unavailable (Safari private mode, Node.js without explicit polyfill).

`scope: "temp"` automatically disables sync.

> **BFCache note:** Keeping a `BroadcastChannel` open can reduce back/forward cache restore success if the page receives channel messages while it is stored in bfcache. In browsers that report bfcache blocking reasons, this may appear as `broadcastchannel-message`. If your app is highly sensitive to instant back/forward navigation performance, test pages that enable `sync` with the browser's bfcache diagnostics.

---

## `SyncOptions` Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `channel` | `string` | store name | BroadcastChannel name |
| `authToken` | `string` | — | Shared token for lightweight auth |
| `policy` | `"strict" \| "insecure"` | `"strict"` | Auth policy |
| `sign` | `(msg) => unknown` | — | Custom signer |
| `verify` | `(msg) => boolean` | — | Custom verifier |
| `conflictResolver` | `fn` | higher-clock wins | Custom conflict resolution |
| `loopGuard` | `boolean \| { windowMs }` | `true` (100ms) | Suppress re-broadcast loops |
| `maxPayloadBytes` | `number` | — | Reject oversized messages |
| `checksum` | `"hash" \| "none"` | `"hash"` | Payload integrity check |
| `insecure` | `boolean` | — | Deprecated; use `policy: "insecure"` |
