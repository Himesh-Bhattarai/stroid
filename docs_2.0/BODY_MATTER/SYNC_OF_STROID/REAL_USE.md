# Chapter 16: Real Use of Sync Stroid

Chapter opener

Synchronization is only impressive when it serves a product need clearly. Otherwise it becomes complexity wearing a convenient demo.

## Learning Objectives

- Identify good real-world uses for Stroid sync.
- Recognize when sync is unnecessary or misleading.
- Apply sync to product scenarios honestly.
- Decide when built-in sync is enough and when a bigger system is required.

## Chapter Outline

- 16.1 Good Uses for Sync
- 16.2 Poor Uses for Sync
- 16.3 Honest Adoption Rules

## 16.1 Good Uses for Sync

Stroid sync is a good fit for:

- cart state across tabs
- theme or preference state
- lightweight presence-like UI state
- local multi-tab continuity

### Example 16.1: Cart Across Tabs

```ts
import { createStore } from "stroid";
import "stroid/sync";

createStore("cart", {
  items: [],
}, {
  scope: "request",
  sync: true,
});
```

### Example 16.2: Shared Theme State

```ts
createStore("theme", { mode: "dark" }, {
  scope: "global",
  sync: true,
});
```

These are good uses because the state is:

- small
- local to the user's environment
- understandable as whole-store synchronization

## 16.2 Poor Uses for Sync

Built-in sync is a poor fit for:

- large collaborative documents across remote users
- durable multi-device state
- server-authoritative reconciliation
- high-frequency collaborative editing

Table 16.1: Good Fit vs Bad Fit

| Scenario | Fit for Stroid Sync? | Why |
|---|---|---|
| cart across tabs | Yes | local peer sync is enough |
| theme across tabs | Yes | tiny whole-store state |
| remote collaborative editor | No | needs stronger collaboration model |
| multi-device offline-first data sync | No | needs durable server reconciliation |

## 16.3 Honest Adoption Rules

Use Sync Stroid when:

- the peers are local and browser-adjacent
- whole-store broadcasting is acceptable
- conflict cost is low to moderate
- reconnect catch-up is enough

Do not use Sync Stroid when:

- you need durable remote conflict history
- the server must arbitrate truth
- the domain requires operation-based collaboration
- the state is too large or too frequent for coarse store sync

### Case Study 16.1: Choosing Restraint

A lot of engineering pain begins with one sentence:

"We can probably make this simple thing handle one more class of problem."

Sometimes that is true.
Often it is how a clear tool becomes a dishonest one.

The honest strength of Stroid sync is not that it solves every distributed-state problem.
Its strength is that it solves a narrow but useful class well enough to be practical.

That is a better identity than pretending it is a universal collaboration engine.

## Chapter 16 Summary

- Stroid sync is strong for local peer-state scenarios such as carts, themes, and lightweight cross-tab continuity.
- It is not a replacement for remote collaborative infrastructure.
- The best sync adoption is narrow, explicit, and honest about boundaries.
- Restraint is part of the technical quality of a synchronization tool.

## Chapter 16 Review Questions

1. What makes cart sync a better fit than collaborative document editing?
2. Why is whole-store broadcast a reasonable tradeoff in some domains and a bad one in others?
3. Why is restraint part of good architecture?

## Chapter 16 Exercises/Activities

1. Pick three stores from your app and decide whether sync is a good fit for each.
2. Write a short design note explaining why Stroid sync is or is not enough for your collaboration needs.
3. Model a local cross-tab use case with `sync: true` and a custom channel.

## Chapter 16 References/Further Reading

- [docs/15-sync.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs/15-sync.md)
- [src/features/sync.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/sync.ts)
- [tests/sync.test.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/tests/sync.test.ts)
