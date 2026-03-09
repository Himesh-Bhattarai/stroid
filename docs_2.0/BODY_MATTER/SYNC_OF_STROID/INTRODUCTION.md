# Unit Four: Sync of Stroid

Unit opener

Synchronization sounds simple only until two truths disagree at the same time.

This unit explains Stroid's sync layer as it really is: cross-instance BroadcastChannel coordination with ordering rules, conflict handling, reconnect catch-up, and explicit cleanup.

## Unit Objectives

- Understand what `stroid/sync` actually provides.
- Learn the sync ordering and convergence model.
- Understand how reconnects, late messages, and conflict resolution work.
- Decide when the built-in sync layer is enough and when it is not.

# Chapter 13: Introduction to Sync Stroid

Chapter opener

Sync is not "state, but shared." Sync is state plus disagreement, state plus delay, and state plus the possibility that two valid writers arrive with incompatible timelines.

## Learning Objectives

- Define the role of the sync layer.
- Understand the environments where sync works.
- See why sync is store-attached but still deserves a dedicated unit.
- Learn the baseline message flow.

## Chapter Outline

- 13.1 What Sync Does
- 13.2 The BroadcastChannel Model
- 13.3 Why Sync Is Still Explicit

## 13.1 What Sync Does

Import path:

```ts
import "stroid/sync";
```

Sync lets one store broadcast its state to peers in the same environment family through `BroadcastChannel`.

### Example 13.1: Basic Sync

```ts
import { createStore } from "stroid";
import "stroid/sync";

createStore("cart", { items: [] }, {
  sync: true,
});
```

That one option hides real work:

- channel setup
- message receive handling
- ordering checks
- schema validation on incoming state
- cleanup when the store is deleted

## 13.2 The BroadcastChannel Model

Stroid's sync is local-environment coordination, not remote distributed systems infrastructure.

It is designed for things like:

- tabs
- windows
- peers in the same browser context family

It is not a replacement for:

- WebSocket collaboration
- server reconciliation
- durable multi-device sync

### Example 13.2: Named Channel

```ts
createStore("document", { content: "" }, {
  sync: {
    channel: "docs-room",
  },
});
```

That channel gives related instances a place to exchange store state.

## 13.3 Why Sync Is Still Explicit

Sync feels magical when it works and dangerous when it is forgotten.

That is why it should never be silently on.

### Figure 13.1: Explicit Sync Is Safer Sync

```ts
import { createStore } from "stroid";
import "stroid/sync";

createStore("presence", { online: true }, {
  sync: true,
});
```

The import says:

- this app is opting into peer state movement
- message ordering now matters
- cleanup now matters more

### Case Study 13.1: Why Human Intuition Fails Here

People think "latest" is obvious.

It is not.

Latest by:

- wall clock?
- local write order?
- arrival time?
- source identity?

Sync forces the system to answer that question precisely. Once that happens, documentation has to become more exact too.

## Chapter 13 Summary

- `stroid/sync` enables cross-instance store state movement through `BroadcastChannel`.
- It is useful for peer-local synchronization, not remote distributed systems.
- Sync is explicit because it changes the reality model of the store.
- "Latest" must be defined by rules, not intuition.

## Chapter 13 Review Questions

1. What kind of problem is Stroid sync designed to solve?
2. Why is sync not a substitute for remote collaboration infrastructure?
3. Why is explicit activation important for sync?

## Chapter 13 Exercises/Activities

1. Describe a store in your app that should sync across tabs and one that should not.
2. Write a minimal synced store example with a named channel.
3. Explain why arrival order alone is not a safe definition of truth.

## Chapter 13 References/Further Reading

- [src/features/sync.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/sync.ts)
- [docs/15-sync.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs/15-sync.md)


## Navigation

- Previous: [Chapter 12: Real Use of Async Stroid](../ASYNC_OF_STROID/REAL_USE.md)
- Jump to: [Unit Four: Sync of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-four-sync-of-stroid)
- Next: [Chapter 14: Sync Options and Ordering](SYNC_OPTIONS.md)
