# Chapter 66: Tooling and Debugging

## Problem

State becomes dangerous when the only debugger is memory.

## Why Existing Solutions Fail

Many tools add debugging late, which means:

- naming was weak from the start
- metadata is incomplete
- observability depends on custom logs

## Design Principle

Tooling should attach to runtime facts, not fantasy.

## Architecture

Stroid splits tooling into:

- `stroid/devtools` for history and Redux DevTools bridge
- `stroid/runtime-tools` for inspection
- `stroid/runtime-admin` for cleanup and global operations

## Implementation

```ts
import { listStores, getStoreMeta } from "stroid/runtime-tools";
import { clearHistory, getHistory } from "stroid/devtools";

console.log(listStores());
console.log(getStoreMeta("checkout"));
console.log(getHistory("checkout"));
clearHistory("checkout");
```

Tooling works better when the runtime already had names and boundaries.


## Navigation

- Previous: [Chapter 65: React Bindings](REACT_BINDINGS.md)
- Jump to: [Unit Fifteen: Binary to Being](../../FRONT_MATTER/CONTENTS.md#unit-fifteen-binary-to-being)
- Next: [Chapter 67: Production Patterns](PRODUCTION_PATTERNS.md)
