# Chapter 60: Runtime Architecture

## Problem

When state runtime boundaries are vague, teams stop knowing which layer owns behavior.

## Why Existing Solutions Fail

Many systems mix together:

- storage concerns
- React concerns
- transport concerns
- debugging concerns

That can feel convenient early and expensive later.

## Design Principle

Separate runtime layers without fragmenting the mental model.

## Architecture

Stroid's runtime is organized around:

- core store primitives in `stroid` and `stroid/core`
- side-effect feature registration in `stroid/persist`, `stroid/sync`, and `stroid/devtools`
- separate runtime layers like `stroid/react`, `stroid/async`, and `stroid/selectors`

## Implementation

```ts
import { createStore } from "stroid";
import "stroid/persist";
import "stroid/sync";

createStore("cart", { items: [] }, {
  persist: { key: "cart" },
  sync: true,
});
```

One mental model.
Several layers.
No hidden auto-registration.


## Navigation

- Previous: [Chapter 59: Design Principles of Stroid](DESIGN_PRINCIPLES_OF_STROID.md)
- Jump to: [Unit Fifteen: Binary to Being](../../FRONT_MATTER/CONTENTS.md#unit-fifteen-binary-to-being)
- Next: [Chapter 61: Store System](STORE_SYSTEM.md)
