# Unit Three: Async of Stroid

Unit opener

Async is where many state systems stop being simple. Not because the API is hard to call, but because time itself becomes part of the bug surface.

This unit explains Stroid's async layer as it really exists: a request-driven store orchestration system with cache, dedupe, retry, revalidation, and cleanup behavior.

## Unit Objectives

- Understand what `stroid/async` actually owns.
- Learn how `fetchStore` creates and drives async-backed stores.
- See how cache, retry, dedupe, and cleanup work together.
- Understand when the async layer is useful and when it is too opinionated for the job.

# Chapter 9: Introduction to Async Stroid

Chapter opener

Most developers think async problems are about requests. They are usually about timing, ownership, and stale assumptions.

## Learning Objectives

- Define what the async layer is responsible for.
- Understand the shape of an async-backed store.
- Distinguish core state updates from request-driven store orchestration.
- Recognize why async is a separate module instead of a core option.

## Chapter Outline

- 9.1 What the Async Layer Does
- 9.2 The Async Store Shape
- 9.3 Why Async Is an Explicit Import

## 9.1 What the Async Layer Does

Import path:

```ts
import { fetchStore, refetchStore, enableRevalidateOnFocus, getAsyncMetrics } from "stroid/async";
```

The async layer does not add behavior to a store through `createStore(..., options)` the way persistence or sync do.

Instead, it does something different:

- initializes async-shaped stores when needed
- drives them through request lifecycles
- tracks inflight work
- keeps cache metadata
- supports revalidation
- cleans up async state when stores disappear

### Example 9.1: First Async Store

```ts
import { fetchStore } from "stroid/async";

await fetchStore("products", "/api/products");
```

If the store does not exist yet, the async layer creates it automatically with the expected async state shape.

## 9.2 The Async Store Shape

The async layer manages a store that behaves like this:

Table 9.1: Async Store State Shape

| Field | Meaning |
|---|---|
| `data` | latest resolved payload or `null` |
| `loading` | request is currently active |
| `error` | error message or `null` |
| `status` | `idle`, `loading`, `success`, `error`, or `aborted` |
| `cached` | response came from cache |
| `revalidating` | background refresh is running |

### Example 9.2: Reading the Async Store

```ts
import { getStore } from "stroid";
import { fetchStore } from "stroid/async";

await fetchStore("products", "/api/products");

console.log(getStore("products"));
```

This means the async layer is not "just fetch helpers." It is a controlled contract for how remote state appears in the store system.

## 9.3 Why Async Is an Explicit Import

Async is powerful, but it is not universal.

Some teams want:

- raw `fetch`
- React Query
- TanStack Query
- SWR
- custom request orchestration

Stroid keeps its async layer first-party, but optional, because:

- not every app needs it
- not every app wants its opinionated caching model
- not every app wants request lifecycle state represented in the same store system

### Figure 9.1: Async as a Layer, Not a Hidden Core Feature

```ts
import { createStore } from "stroid";
import { fetchStore } from "stroid/async";

createStore("searchFilters", { q: "", page: 1 });
await fetchStore("searchResults", "/api/search?q=books");
```

Core still handles ordinary state.
Async handles request-driven state.

That separation is cleaner than pretending they are the same problem.

### Case Study 9.1: Why Async Bugs Feel Different

A normal state bug is often local.

An async bug is rarely local.

It usually touches:

- timing
- cancellation
- stale data
- retries
- store lifetime
- race order

That is why the async layer deserves its own unit. Once time enters the model, the system becomes psychologically harder for humans to reason about. Good documentation has to slow that down and name the moving parts clearly.

## Chapter 9 Summary

- `stroid/async` is a request orchestration layer, not a store-attached feature.
- It creates and drives stores using an explicit async state shape.
- It stays outside core because it is useful but opinionated.
- Async deserves special treatment because time changes the failure model.

## Chapter 9 Review Questions

1. Why is the async layer different from `persist` and `sync`?
2. What fields define the async store shape?
3. Why is keeping async outside core a better boundary?

## Chapter 9 Exercises/Activities

1. Create a store name plan for local state and async state separately in one feature.
2. Sketch the async state shape for a `users` request.
3. Explain why "request finished" is not enough to describe an async system.

## Chapter 9 References/Further Reading

- [src/async.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/async.ts)
- [docs/13-async.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs/13-async.md)
- [RUNTIME_LAYERS.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs_2.0/BODY_MATTER/OPT_IN_FEATURES_OF_STROID/RUNTIME_LAYERS.md)


## Navigation

- Previous: [Chapter 8: Power Tools and Utility Subpaths](../OPT_IN_FEATURES_OF_STROID/POWER_TOOLS.md)
- Jump to: [Unit Three: Async of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-three-async-of-stroid)
- Next: [Chapter 10: Fetch Flow, Retry, and Dedupe](FETCH_FLOW.md)
