# Snapshot cache leaks deleted stores and exposes a mutable shared snapshot

Severity: high

## Summary

`_snapshotCache` is never cleared in `deleteStore()`, and `_getSnapshot()` returns the cached snapshot object by reference until the underlying store reference changes.

Relevant code:

- [src/store.ts:657](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store.ts#L657)
- [src/store.ts:866](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store.ts#L866)

## Problems

### 1. Delete leak

`deleteStore()` removes store state, subscribers, metadata, and history, but does not delete `_snapshotCache[name]`.

Repeated create/delete cycles can retain old snapshot objects in memory until a hard test reset or process restart.

### 2. Mutable shared snapshot

`_getSnapshot()` returns the same cached snapshot object while `cached.source === source`.

If a consumer mutates the returned snapshot object, that mutation is shared across subsequent `_getSnapshot()` readers until the store changes again.

That does not corrupt `_stores[name]`, but it does violate snapshot immutability expectations and can poison React selector caching.

## Why this matters

- hidden shared references between readers
- memory retained after delete
- React external store snapshots are expected to behave as immutable snapshots

## Fix direction

- Delete `_snapshotCache[name]` in `deleteStore()`
- Consider freezing cached snapshots in dev
- Add tests for:
  - cache entry removed on delete
  - mutating a returned snapshot does not affect the next `_getSnapshot()` call
