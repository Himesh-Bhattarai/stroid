# Chapter 67: Production Patterns

## Problem

A library can look elegant in demos and collapse in production organization.

## Why Existing Solutions Fail

Production pain usually comes from:

- weak naming conventions
- mixing temporary UI state with domain state
- turning every capability on by default

## Design Principle

Production architecture should scale by clearer boundaries, not by more magic.

## Architecture

A practical Stroid production layout often looks like:

```text
src/state/
  auth.ts
  theme.ts
  checkout.ts
  search.ts
src/features/
  enable-devtools.ts
```

Guidelines:

- one file per domain store
- explicit imports for heavier features
- use core first, then add runtime layers only where needed

## Implementation

```ts
// src/state/theme.ts
import { createStore } from "stroid";
import "stroid/persist";

createStore("theme", { mode: "dark" }, {
  persist: { key: "theme" },
});
```

Production patterns are boring on purpose.
Boring architecture is easier to keep alive.


## Navigation

- Previous: [Chapter 66: Tooling and Debugging](TOOLING_AND_DEBUGGING.md)
- Jump to: [Unit Fifteen: Binary to Being](../../FRONT_MATTER/CONTENTS.md#unit-fifteen-binary-to-being)
- Next: [Chapter 68: Start Here](../BEGINNER_GUIDE/START_HERE.md)
