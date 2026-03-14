# Chapter 15: Conflicts, Catch-Up, and Cleanup

Chapter opener

The real test of a sync system is not the happy path. It is what the system does when it comes back late, receives stale truth, or has to decide whether a disagreement can still converge.

## Learning Objectives

- Understand conflict resolution behavior.
- Learn how reconnect catch-up works.
- See how late messages are handled.
- Understand why cleanup is essential in sync systems.

## Chapter Outline

- 15.1 Conflict Resolution
- 15.2 Catch-Up on Focus and Online
- 15.3 Cleanup and Late Messages

## 15.1 Conflict Resolution

When ordering alone does not settle the situation the way your domain wants, `conflictResolver` can intervene.

### Example 15.1: Domain Resolver

```ts
createStore("editor", { content: "" }, {
  sync: {
    conflictResolver: ({ local, incoming, localUpdated, incomingUpdated }) => {
      return incomingUpdated >= localUpdated ? incoming : local;
    },
  },
});
```

Stroid can rebroadcast resolved state so peers converge on the resolved value instead of merely resolving locally and drifting apart.

## 15.2 Catch-Up on Focus and Online

The sync layer requests the latest snapshot when peers:

- start up
- regain focus
- come back online

### Example 15.2: Reconnect Mental Model

You do not call a public catch-up function directly.
The sync runtime performs snapshot requests internally when the environment signals that a peer may be stale.

This matters because temporary disconnection is normal.
What matters is whether re-entry becomes synchronization or confusion.

## 15.3 Cleanup and Late Messages

Stores are deleted.
Channels live longer than people assume.
Messages arrive after the state they reference is already gone.

Good sync must survive that without corrupting the registry.

### Example 15.3: Delete and Ignore

If a store is deleted and a late sync message arrives later, the runtime should ignore it safely rather than recreating dead truth by accident.

That behavior matters more than it looks, because stale systems are often rebuilt by late side effects, not by explicit intent.

### Case Study 15.1: Why Cleanup Is the Real Maturity Test

Many systems can synchronize.
Fewer systems can stop synchronizing cleanly.

Cleanup proves whether a design understands its own lifetime boundaries.

Without cleanup:

- old channels survive
- old listeners survive
- old truths keep speaking

That is not just a memory leak.
It is a reality leak.

## Chapter 15 Summary

- `conflictResolver` exists for domain-specific disagreement handling.
- Sync peers request the latest snapshot when focus or connectivity returns.
- Late messages must be ignored safely after deletion.
- Cleanup is one of the clearest markers of sync maturity.

## Chapter 15 Review Questions

1. Why is rebroadcasting resolved state important for convergence?
2. Why do focus and online events matter in sync?
3. Why is stale-message handling part of correctness?

## Chapter 15 Exercises/Activities

1. Design a `conflictResolver` for a document store.
2. Explain how a tab that was offline should catch up safely.
3. Describe what could go wrong if channels and listeners are not cleaned up after deletion.

## Chapter 15 References/Further Reading

- [src/features/sync.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/sync.ts)
- [tests/sync.test.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/tests/sync.test.ts)


## Navigation

- Previous: [Chapter 14: Sync Options and Ordering](SYNC_OPTIONS.md)
- Jump to: [Unit Four: Sync of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-four-sync-of-stroid)
- Next: [Chapter 16: Real Use of Sync Stroid](REAL_USE.md)
