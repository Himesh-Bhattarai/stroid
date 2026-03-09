# conflictResolver applies locally but does not propagate the resolved state

Severity: high

## Summary

When `conflictResolver` returns a resolved value, Stroid applies it locally and notifies subscribers, but it does not rebroadcast that resolved state to other peers.

Relevant code:

- [src/features/sync.ts:177](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/sync.ts#L177)
- [src/features/sync.ts:202](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/sync.ts#L202)

## Why it happens

In the `order <= 0` branch:

1. `conflictResolver` runs
2. `setStoreValue()` applies the resolved value
3. `updateMetaAfterSync()` updates metadata
4. `notify()` informs local subscribers

There is no `broadcastSync(name)` call afterward.

## Failure mode

A peer can resolve a contested update to a third value, but that resolved value remains local unless every other peer independently computes and applies the exact same resolution.

In a 3+ instance topology, this can leave different peers on different final states.

## Why this matters

This makes `conflictResolver` a local conflict handler, not a convergence mechanism.

That is a dangerous mismatch for cross-tab synchronization semantics.

## Fix direction

- Decide whether the resolved value is authoritative
- If yes, rebroadcast it after resolution
- Add a multi-peer test where:
  - two peers write conflicting values
  - one peer resolves to a third value
  - all peers converge to that resolved value
