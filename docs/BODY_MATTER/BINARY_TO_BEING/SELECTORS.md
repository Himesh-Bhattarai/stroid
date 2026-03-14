# Chapter 64: Selectors

## Problem

As apps grow, broad subscriptions turn local reads into whole-screen costs.

## Why Existing Solutions Fail

Selector systems fail when they encourage overengineering or hide subscription breadth.

The result is usually one of two extremes:

- everything rerenders too often
- the selector graph becomes harder than the product logic

## Design Principle

Selection should be optional and intentional.

## Architecture

Stroid places selectors in `stroid/selectors` and the React hooks layer instead of forcing selector machinery into core.

That preserves a clearer distinction between:

- direct reads
- derived reads
- subscription precision

## Implementation

```ts
import { createSelector } from "stroid/selectors";

const selectCompletedItems = createSelector("todos", (state: any) =>
  state.items.filter((item: any) => item.done)
);
```

Selectors are useful.
They are not free.


## Navigation

- Previous: [Chapter 63: Persistence Layer](PERSISTENCE_LAYER.md)
- Jump to: [Unit Fifteen: Binary to Being](../../FRONT_MATTER/CONTENTS.md#unit-fifteen-binary-to-being)
- Next: [Chapter 65: React Bindings](REACT_BINDINGS.md)
