# Sync divergence on simultaneous writes with equal clocks/timestamps

Severity: critical

## Summary

The sync ordering algorithm can diverge across peers when two instances write concurrently with the same logical clock and `updatedAt`.

## Why it happens

- Incoming messages are ordered by:
  1. `clock`
  2. `updatedAt`
  3. `incoming.source.localeCompare(instanceId)`
- After applying any remote message, the receiver calls `absorbSyncClock`, which bumps the local clock to `max(local, incoming) + 1`.

Relevant code:

- [src/features/sync.ts:25](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/sync.ts#L25)
- [src/features/sync.ts:80](/c:/Users\Himesh\Desktop\SM_STROID\stroid\src\features\sync.ts#L80)
- [src/features/sync.ts:178](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/sync.ts#L178)
- [src/features/sync.ts:211](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/sync.ts#L211)

## Failure mode

Example:

1. Instance `A` writes `clock=1`, timestamp `T`
2. Instance `B` writes `clock=1`, timestamp `T`
3. A third instance `C` receives `A` first
4. `C` applies `A` and bumps local clock to `2`
5. `C` later receives `B` with `clock=1`
6. `B` is now rejected as older because `1 < 2`

At the same time, `A` and `B` may converge to a different winner via the source tie-break.

Result: different peers can settle on different final values depending on arrival order.

## Why this is release-blocking

This breaks the core sync guarantee: eventual convergence under concurrent writes.

## Fix direction

- Track the source of the last accepted write in metadata and compare incoming writes against the last accepted event, not the receiver's own `instanceId`.
- Alternatively, use a proper tuple ordering like `(clock, updatedAt, source)` and persist that tuple as the store's last sync version.
- Add a 3-instance test where two writers emit equal clock/timestamp updates and a third peer receives them in opposite orders.
