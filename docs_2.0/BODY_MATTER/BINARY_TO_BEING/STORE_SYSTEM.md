# Chapter 61: Store System

## Problem

If the store system is weak, every advanced feature inherits that weakness.

## Why Existing Solutions Fail

Some libraries make stores easy to create but weak to govern:

- pathless mutation
- no clear lifecycle boundary
- no built-in place for validation

## Design Principle

The store is the center of policy, not just a bag of values.

## Architecture

A Stroid store carries:

- a name
- an initial state
- current state
- metadata
- subscriptions
- attached rules

## Implementation

```ts
import { createStore, getStore, resetStore, setStore, setStoreBatch } from "stroid";

createStore("checkout", {
  step: 1,
  acceptedTerms: false,
}, {
  validate: (next) => next.step >= 1 && next.step <= 4,
});

setStoreBatch(() => {
  setStore("checkout", "step", 2);
  setStore("checkout", "acceptedTerms", true);
});

console.log(getStore("checkout"));
resetStore("checkout");
```

The store system stays useful because it has both state and rules.


## Navigation

- Previous: [Chapter 60: Runtime Architecture](RUNTIME_ARCHITECTURE.md)
- Jump to: [Unit Fifteen: Binary to Being](../../FRONT_MATTER/CONTENTS.md#unit-fifteen-binary-to-being)
- Next: [Chapter 62: Async Layer](ASYNC_LAYER.md)
