# Unit One: Core of Stroid

Unit opener

Stroid becomes easier the moment you stop treating state as a pile of variables and start treating it as a system with memory, rules, and consequences.

This unit explains the part that matters most: the core runtime. Before persistence, sync, React bindings, or async helpers, there is one central idea: a named store with explicit rules.

## Unit Objectives

- Understand what the lean `stroid` and `stroid/core` packages contain.
- Learn the core mental model behind `createStore`, `setStore`, `getStore`, and lifecycle rules.
- See why Stroid keeps one option object instead of many disconnected APIs.
- Build intuition for when to stay in core and when to import optional feature modules.

# Chapter 1: Introduction to Core Stroid

Chapter opener

The strongest documentation does not begin with syntax. It begins with a worldview. Stroid is not designed around "how do I mutate this object quickly?" It is designed around "how do I make state behavior obvious, safe, and composable under pressure?"

## Learning Objectives

- Define what Stroid core is and what it intentionally excludes.
- Explain the named-store model.
- Understand the difference between core runtime and optional feature modules.
- Describe the default safety guarantees Stroid applies before and after updates.

## Chapter Outline

- 1.1 What Core Actually Means
- 1.2 The Named-Store Mental Model
- 1.3 Lean by Default, Expand by Intent

## 1.1 What Core Actually Means

Core is the part of Stroid that should matter even if your app never uses persistence, sync, or React.

In practical terms, lean `stroid` and `stroid/core` focus on:

- named stores
- creation
- updates
- reads
- reset and delete operations
- batching
- hydration
- schema and validation gates
- lifecycle and middleware hooks

Core does **not** automatically enable:

- persistence
- sync
- devtools integration
- React hooks
- async fetch helpers

That boundary matters. It means the default runtime stays small and understandable, while the public API still preserves one coherent mental model.

### Example 1.1: The Smallest Useful Store

```ts
import { createStore, getStore, setStore } from "stroid";

createStore("counter", { count: 0 });
setStore("counter", "count", 1);

const snapshot = getStore("counter");
// { count: 1 }
```

This example is intentionally boring. Boring is good. A runtime becomes trustworthy when the simple case is unambiguous.

### Example 1.2: The Same Core, Different Entry

```ts
import { createStore, getStore, setStore } from "stroid/core";

createStore("session", { step: 1 });
setStore("session", { step: 2 });

console.log(getStore("session"));
```

Use `stroid` when you want the lean default entry. Use `stroid/core` when you want the same core surface explicitly. Both are now intentionally close.

## 1.2 The Named-Store Mental Model

A named store is more than a convenience. It changes how you reason about application state.

With Stroid, state is not hidden inside closures or trapped inside component trees. Instead, each store has:

- a stable name
- an initial state
- a current state
- metadata
- subscriber relationships
- operational rules

That means you do not ask "where is this atom defined?" or "which provider owns this slice?" first. You ask, "what is the store called, and what are its rules?"

This gives three major benefits:

1. State becomes discoverable.
2. Shared behavior becomes easier to centralize.
3. Tooling becomes possible without rewriting application code.

Table 1.1: Core Mental Model

| Concern | Stroid Core Answer |
|---|---|
| How is state identified? | By store name |
| How is state created? | `createStore(name, initial, options)` |
| How is state updated? | `setStore`, `mergeStore`, `resetStore`, `hydrateStores` |
| How is state read? | `getStore` |
| How is behavior attached? | Through one options object |
| How are optional capabilities activated? | Explicit feature imports |

## 1.3 Lean by Default, Expand by Intent

A good runtime respects restraint. It does not assume every app wants sync, persistence, and devtools at all times.

That is why Stroid separates:

- core behavior
- optional feature registration
- environment-specific layers like React and async

If a store uses persistence, sync, or devtools, those modules should be imported explicitly. This makes the bundle story honest and keeps the architecture legible.

### Figure 1.1: Package Shape in Practice

```ts
import { createStore } from "stroid";
import "stroid/persist";
import "stroid/sync";
import "stroid/devtools";

createStore("user", { id: "", name: "" }, {
  persist: true,
  sync: true,
  devtools: true,
});
```

The shape stays stable. The feature cost is opt-in.

### Case Study 1.1: Why This Model Ages Better

A small team usually starts with only local state concerns. Months later they want persistence. Then they want sync. Then they need instrumentation. In many libraries, each new concern forces a new pattern, new wrapper, or new mental model.

Stroid takes a different route:

- the store name stays the same
- the core API stays the same
- the option object stays the same
- only feature imports change

That continuity is not accidental. It is what makes the library feel stable under growth.

## Chapter 1 Summary

- Stroid core is the named-store runtime, not the full optional ecosystem.
- The main mental model is: create a named store, attach rules once, then read and update it safely.
- Lean `stroid` and `stroid/core` intentionally avoid auto-enabling persistence, sync, and devtools.
- The option object is central because it keeps behavior discoverable and unified.

## Chapter 1 Review Questions

1. Why does Stroid use named stores instead of anonymous state handles as its primary model?
2. What is the difference between core runtime behavior and optional feature registration?
3. Why is explicit feature importing an architectural advantage, not just a size trick?

## Chapter 1 Exercises/Activities

1. Create a store named `profile` with an object state and explain which parts of its behavior are core by default.
2. Write the same example once with `stroid` and once with `stroid/core`. Explain why both exist.
3. List three stores from your current or recent project and rename them as explicit Stroid stores by intent, such as `session`, `theme`, or `checkoutDraft`.

## Chapter 1 References/Further Reading

- [docs/03-core-philosophy.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs/03-core-philosophy.md)
- [docs/04-createStore.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs/04-createStore.md)
- [OVERVIEW.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/OVERVIEW.md)


## Navigation

- Previous: [How to Use This Book](../../FRONT_MATTER/HOW_TO_USE.md)
- Jump to: [Unit One: Core of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-one-core-of-stroid)
- Next: [Chapter 2: Core Options](CORE_OPTIONS.md)
