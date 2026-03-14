# Chapter 63: Persistence Layer

## Problem

Remembering state sounds easy until old data, broken schema, and storage failures arrive.

## Why Existing Solutions Fail

Persistence often fails because it is treated as a toggle instead of a lifecycle:

- version drift is ignored
- migrations are underdesigned
- recovery strategy is missing

## Design Principle

Persistent state should be explicit, versioned, and recoverable.

## Architecture

Stroid persistence is attached per store through feature registration plus options:

- import `stroid/persist`
- add `persist` config in `createStore`
- let migrations and failure strategy live with the store

## Implementation

```ts
import { createStore } from "stroid";
import "stroid/persist";

createStore("settings", {
  theme: "dark",
  compact: false,
}, {
  persist: {
    key: "settings",
    version: 2,
  },
});
```

This keeps remembered state inside the same architectural contract as live state.


## Navigation

- Previous: [Chapter 62: Async Layer](ASYNC_LAYER.md)
- Jump to: [Unit Fifteen: Binary to Being](../../FRONT_MATTER/CONTENTS.md#unit-fifteen-binary-to-being)
- Next: [Chapter 64: Selectors](SELECTORS.md)
