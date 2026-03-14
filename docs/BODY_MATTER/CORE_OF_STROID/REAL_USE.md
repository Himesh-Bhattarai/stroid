# Chapter 4: Real Use of Core Stroid

Chapter opener

A runtime proves itself in the places where teams usually become careless: temporary UI state, shared application state, and server-driven startup state. The question is never "can this library store data?" The question is "does it keep meaning intact when the app gets messy?"

## Learning Objectives

- Map `request`, `temp`, and `global` scope to real product use.
- Choose when a store should remain core-only versus feature-extended.
- Understand how Stroid reads intent from scope and options together.
- Learn practical patterns that reduce accidental complexity.

## Chapter Outline

- 4.1 Temp Stores for Local Product Flow
- 4.2 Global Stores for Shared App Memory
- 4.3 Request Stores for Bootstrap and SSR

## 4.1 Temp Stores for Local Product Flow

Temporary state is where many codebases quietly decay.

People tell themselves:

- "this is only for one dropdown"
- "this is only a quick form draft"
- "this is only a modal step"

Then three months later, the temporary thing became business logic.

That is why `scope: "temp"` matters. It names a class of state honestly.

### Example 4.1: Dropdown Controller

```ts
import { createStore, setStore, getStore } from "stroid";

createStore("accountMenu", {
  open: false,
  activeItem: "profile",
}, {
  scope: "temp",
});

setStore("accountMenu", "open", true);
console.log(getStore("accountMenu"));
```

This kind of store benefits from:

- no persistence by default
- no sync by default
- no devtools/history overhead by default

Temp scope is not just a label. It tells the runtime what kind of seriousness this state deserves.

### Example 4.2: Form Draft That Stays Ephemeral

```ts
createStore("profileDraft", {
  name: "",
  bio: "",
  dirty: false,
}, {
  scope: "temp",
  lifecycle: {
    onSet: (prev, next) => {
      if (prev.name !== next.name || prev.bio !== next.bio) {
        console.log("draft changed");
      }
    },
  },
});
```

The psychological advantage here is subtle: once a store is called a draft and declared as temp, developers are less likely to smuggle permanent behavior into it by accident.

## 4.2 Global Stores for Shared App Memory

Some state is supposed to outlive a page, a component, or a local flow. That is what `scope: "global"` is for.

Use global scope for things like:

- theme
- auth session
- app configuration
- language selection

### Example 4.3: Theme Store

```ts
import { createStore } from "stroid";
import "stroid/persist";

createStore("theme", {
  mode: "dark",
}, {
  scope: "global",
  persist: {
    key: "theme_preference",
    version: 1,
  },
});
```

This is a good global store because:

- the name is stable
- the data is small
- the persistence story is obvious
- the value should outlive a screen or request

Table 4.1: Good Fit by Scope

| Store Example | Best Scope | Reason |
|---|---|---|
| `accountMenu` | `temp` | Local, disposable interaction state |
| `profileDraft` | `temp` | Short-lived draft memory |
| `checkout` | `request` | Real workflow state, but not permanent by default |
| `theme` | `global` | Shared app preference |
| `authSession` | `global` | Long-lived shared identity state |

## 4.3 Request Stores for Bootstrap and SSR

`request` is the default scope because most state is neither purely disposable nor truly global. It belongs to a real application flow, not to the whole universe.

Request scope is the right conceptual home for:

- checkout progress
- page bootstrap data
- wizard state
- server-prepared snapshots

### Example 4.4: Request-Oriented Checkout Flow

```ts
createStore("checkout", {
  step: 1,
  cartId: "",
  completed: false,
}, {
  scope: "request",
});
```

### Example 4.5: Server-Prepared Bootstrap

```ts
import { createStoreForRequest } from "stroid/server";
import { hydrateStores } from "stroid";

const requestState = createStoreForRequest((api) => {
  api.create("bootstrap", {
    user: null,
    locale: "en",
  });
});

const snapshot = requestState.snapshot();
hydrateStores(snapshot, {}, { allowUntrusted: true });
```

This is where Stroid becomes especially useful: request scope and hydration let you think about bootstrapping as a controlled state handoff instead of a tangle of ad hoc serialization.
Only hydrate trusted snapshots. If you read JSON from HTML, parse from a non-executable script tag and validate/sanitize before calling `hydrateStores`.

### Case Study 4.1: Choosing Scope Before Writing the Store

Before creating a store, ask three questions:

1. Should this outlive the interaction that created it?
2. Should this be shared broadly across the app?
3. Would it be dangerous if this persisted or synced by default?

Those three questions usually reveal the right scope quickly:

- if it should die with the interaction, choose `temp`
- if it is standard app workflow state, choose `request`
- if it is deliberately long-lived and shared, choose `global`

This matters because systems become cleaner when intent is named before implementation details arrive.

## Chapter 4 Summary

- `temp` is for disposable interaction and draft state.
- `request` is for standard application flow and bootstrap-oriented state.
- `global` is for long-lived, shared, intentional state.
- Scope is now a practical design tool, not a decorative enum.

## Chapter 4 Review Questions

1. Why is `temp` a better fit for a dropdown store than `request` or `global`?
2. When should you choose `global` instead of simply making a request-scoped store persistent?
3. How does `createStoreForRequest` fit the meaning of request-oriented state?

## Chapter 4 Exercises/Activities

1. Design three stores from a real product and assign each one a scope with justification.
2. Refactor a "temporary" piece of UI state from your own code into a `temp` store.
3. Sketch a server-to-client bootstrap flow using `createStoreForRequest` and `hydrateStores`.

## Chapter 4 References/Further Reading

- [src/store.ts](/src/store.ts)
- [src/server.ts](/src/server.ts)
- [Chapter 41: Introduction to Server Stroid](../SERVER_OF_STROID/INTRODUCTION.md)


## Navigation

- Previous: [Chapter 3: Core Examples](EXAMPLE.md)
- Jump to: [Unit One: Core of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-one-core-of-stroid)
- Next: [Chapter 5: Introduction to Opt-In Features](../OPT_IN_FEATURES_OF_STROID/INTRODUCTION.md)

