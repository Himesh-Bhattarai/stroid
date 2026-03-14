# Chapter 6: Store-Attached Features

Chapter opener

Some features do not need a new mental model. They need a new power source. Stroid's store-attached features work this way: the same store shape, the same options object, but more capability once the right module is present.

## Learning Objectives

- Understand the role of `stroid/persist`, `stroid/sync`, and `stroid/devtools`.
- Learn how feature registration works conceptually.
- Know which option groups belong to each feature import.
- Understand what happens if a store asks for a feature that was not imported.

## Chapter Outline

- 6.1 Persistence
- 6.2 Sync
- 6.3 Devtools and History

## 6.1 Persistence

Import path:

```ts
import "stroid/persist";
```

Persistence is the feature that lets a store survive refreshes and restarts through a storage-like driver.

### Example 6.1: Minimal Persistence

```ts
import { createStore } from "stroid";
import "stroid/persist";

createStore("theme", { mode: "dark" }, {
  persist: true,
});
```

### Example 6.2: Configured Persistence

```ts
createStore("auth", {
  user: null,
  token: null,
}, {
  persist: {
    key: "app_auth",
    version: 2,
    serialize: JSON.stringify,
    deserialize: JSON.parse,
    encrypt: (raw) => raw,
    decrypt: (raw) => raw,
    onMigrationFail: "reset",
  },
});
```

Persistence controls:

- storage driver
- storage key
- encoding
- optional wrapping through `encrypt` / `decrypt`
- versioning and migrations
- migration failure behavior
- storage-cleared observation

## 6.2 Sync

Import path:

```ts
import "stroid/sync";
```

Sync lets store state move across peer instances through `BroadcastChannel`.

### Example 6.3: Basic Cross-Tab Sync

```ts
import { createStore } from "stroid";
import "stroid/sync";

createStore("cart", { items: [] }, {
  sync: true,
});
```

### Example 6.4: Custom Sync Channel

```ts
createStore("document", { content: "" }, {
  sync: {
    channel: "docs-room",
    maxPayloadBytes: 32 * 1024,
    conflictResolver: ({ local, incoming, localUpdated, incomingUpdated }) => {
      return incomingUpdated >= localUpdated ? incoming : local;
    },
  },
});
```

Sync handles:

- peer channel setup
- message broadcast
- logical-clock ordering with a deterministic source tie-break
- conflict resolution
- reconnect and focus catch-up
- payload safety limits
- incompatible sync-protocol messages are ignored instead of guessed through

Note:
`localUpdated` and `incomingUpdated` still matter inside `conflictResolver(...)` as context.
But the built-in accept/reject rule is driven by sync clocks first, then a deterministic source tie-break.

## 6.3 Devtools and History

Import path:

```ts
import "stroid/devtools";
```

And when you need history APIs directly:

```ts
import { getHistory, clearHistory } from "stroid/devtools";
```

Devtools is where store inspection becomes explicit.

### Example 6.5: Devtools Per Store

```ts
import { createStore } from "stroid";
import "stroid/devtools";

createStore("profile", { name: "Ari" }, {
  devtools: {
    enabled: true,
    historyLimit: 20,
  },
});
```

### Example 6.6: Reading History

```ts
import { getHistory, clearHistory } from "stroid/devtools";

const history = getHistory("profile");
clearHistory("profile");
```

Devtools covers:

- Redux DevTools bridge
- local history snapshots
- history diffs
- per-store inspection workflows

Table 6.1: Store Feature Imports

| Import | Unlocks | Option Group |
|---|---|---|
| `stroid/persist` | persistence runtime | `persist` |
| `stroid/sync` | cross-instance sync | `sync` |
| `stroid/devtools` | history and devtools | `devtools` |

### Figure 6.1: Same Store, Different Power

```ts
import { createStore } from "stroid";
import "stroid/persist";
import "stroid/sync";
import "stroid/devtools";

createStore("session", { token: null }, {
  persist: true,
  sync: true,
  devtools: true,
});
```

This is the core Stroid bet: imports change the power system, not the mental model.

### Case Study 6.1: Missing Feature Import

If a store asks for persistence, sync, or devtools without importing the corresponding module, Stroid throws by default instead of silently pretending that feature exists.
You can opt into warn-only behavior via `configureStroid({ strictFeatures: false })`, but the default is strict to prevent production data loss.

That is the right behavior.

Silent failure creates superstition.
Explicit failure creates understanding.

## Chapter 6 Summary

- `persist`, `sync`, and `devtools` are store-attached features activated by import path.
- They all stay inside the same `createStore(..., options)` contract.
- History APIs belong to `stroid/devtools`, not core or runtime-tools.
- Missing feature imports throw by default instead of silently becoming undefined behavior.

## Chapter 6 Review Questions

1. Why are persistence, sync, and devtools treated as store-attached features instead of separate store APIs?
2. What is the difference between importing `stroid/devtools` and calling `getHistory` from that subpath?
3. Why is an explicit missing-feature error better than a silent no-op?

## Chapter 6 Exercises/Activities

1. Write one persisted store, one synced store, and one devtools-enabled store.
2. Design a store that uses all three features and explain whether that is a good idea for the domain.
3. Explain what you would expect to happen if the code requests `sync` but never imports `stroid/sync`.

## Chapter 6 References/Further Reading

- [src/persist.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/persist.ts)
- [src/sync.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/sync.ts)
- [src/devtools.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/devtools.ts)
- [docs/14-persist.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs/14-persist.md)
- [docs/15-sync.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs/15-sync.md)
- [docs/19-devtools.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs/19-devtools.md)


## Navigation

- Previous: [Chapter 5: Introduction to Opt-In Features](INTRODUCTION.md)
- Jump to: [Unit Two: Opt-In Features of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-two-opt-in-features-of-stroid)
- Next: [Chapter 7: Runtime Layers](RUNTIME_LAYERS.md)
