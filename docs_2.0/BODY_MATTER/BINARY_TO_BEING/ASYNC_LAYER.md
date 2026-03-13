# Chapter 62: Async Layer

## Problem

Time destroys simple state models.

Loading, retry, cache reuse, abort, and stale data all produce state transitions that ordinary setters do not describe well.

## Why Existing Solutions Fail

Teams often patch async by scattering:

- manual `loading` flags
- duplicated fetch code
- no dedupe
- inconsistent retry policy

## Design Principle

Async should stay explicit without forcing every screen to rebuild fetch orchestration.

## Architecture

Stroid keeps async in `stroid/async` as a separate runtime layer with:

- backing async state stores
- cache slots
- dedupe
- retry and revalidation

## Implementation

```ts
import { fetchStore } from "stroid/async";

await fetchStore("users", "/api/users", {
  ttl: 10_000,
  retry: 2,
  staleWhileRevalidate: true,
});
```

The async layer is not core because time adds real conceptual weight.


## Navigation

- Previous: [Chapter 61: Store System](STORE_SYSTEM.md)
- Jump to: [Unit Fifteen: Binary to Being](../../FRONT_MATTER/CONTENTS.md#unit-fifteen-binary-to-being)
- Next: [Chapter 63: Persistence Layer](PERSISTENCE_LAYER.md)
