# Chapter 3: Core Examples

Chapter opener

Examples are where a runtime stops being admired and starts being trusted. A reader does not remember abstractions under pressure. A reader remembers patterns that already looked like their real code.

## Learning Objectives

- Apply Stroid core APIs in realistic flows.
- See how named stores scale from tiny examples to structured workflows.
- Understand where core ends and optional modules begin in actual code.
- Use scope intentionally in examples that feel like real products.

## Chapter Outline

- 3.1 First Store, First Update
- 3.2 A Real Core Workflow
- 3.3 Expanding Without Losing the Core Shape

## 3.1 First Store, First Update

Start with the smallest possible loop:

1. create the store
2. update the store
3. read the store

### Example 3.1: Counter Store

```ts
import { createStore, getStore, setStore } from "stroid";

createStore("counter", { count: 0 });

setStore("counter", "count", 1);
setStore("counter", { count: 2 });

console.log(getStore("counter"));
// { count: 2 }
```

This example shows two update styles:

- path update
- shallow object merge

Both are valid. The choice depends on what makes the intent easiest to read.

### Example 3.2: Nested Update With Explicit Path

```ts
createStore("user", {
  profile: {
    name: "Ari",
    preferences: {
      theme: "dark",
    },
  },
});

setStore("user", "profile.preferences.theme", "light");
```

Stroid validates the path instead of silently creating impossible branches.

## 3.2 A Real Core Workflow

A useful example should feel like something a team would keep, not just demo.

### Example 3.3: Checkout Progress Store

```ts
import {
  createStore,
  getStore,
  hydrateStores,
  resetStore,
  setStore,
  setStoreBatch,
} from "stroid";

createStore("checkout", {
  step: 1,
  shipping: {
    city: "",
    country: "",
  },
  acceptedTerms: false,
}, {
  scope: "request",
  validate: (next) => next.step >= 1 && next.step <= 4,
  lifecycle: {
    onSet: (prev, next) => {
      console.log("checkout transition", prev.step, "->", next.step);
    },
  },
});

setStore("checkout", "shipping.city", "Kathmandu");

setStoreBatch(() => {
  setStore("checkout", "step", 2);
  setStore("checkout", "acceptedTerms", true);
});

hydrateStores({
  checkout: {
    step: 3,
    shipping: {
      city: "Kathmandu",
      country: "Nepal",
    },
    acceptedTerms: true,
  },
});

console.log(getStore("checkout"));
resetStore("checkout");
```

This is still core. No persistence, no sync, no React. But it already expresses:

- structure
- rules
- batching
- hydration
- lifecycle observation

That is why core matters.

Table 3.1: Which Core API Solves Which Problem

| Problem | Core API |
|---|---|
| create a named source of truth | `createStore` |
| patch part of an object | `setStore(name, partialObject)` |
| change a nested field safely | `setStore(name, "a.b.c", value)` |
| make several writes feel like one notify cycle | `setStoreBatch` |
| read current state | `getStore` |
| restore initial state | `resetStore` |
| load state from server or bootstrap data | `hydrateStores` |

## 3.3 Expanding Without Losing the Core Shape

The best example of Stroid's design is that optional features do not force a second mental model.

### Figure 3.1: Core-First, Feature-Second

```ts
import { createStore } from "stroid";
import "stroid/persist";
import "stroid/devtools";

createStore("theme", {
  mode: "dark",
}, {
  scope: "global",
  persist: {
    key: "theme_store",
    version: 1,
  },
  devtools: {
    enabled: true,
    historyLimit: 20,
  },
});
```

The same shape still works:

- name
- initial state
- options object

That continuity is one of the strongest parts of the design.

### Case Study 3.1: A Team-Friendly Naming Scheme

A messy app often has vague state labels like `data`, `current`, `selected`, or `tmp`.

Stroid rewards sharper names:

- `checkout`
- `searchDraft`
- `theme`
- `authSession`
- `wizardProgress`

Once names become first-class, store design becomes a domain exercise, not just a code exercise. That shift is small but powerful. People read clearer code when the system forces clearer naming.

## Chapter 3 Summary

- Core APIs already cover many real workflows without requiring optional modules.
- Path updates, batching, reset, and hydration make core practical, not minimal for its own sake.
- The same store-creation shape survives when optional features are added.
- Strong naming is part of Stroid's design power, not a side detail.

## Chapter 3 Review Questions

1. What is the difference between a path update and a shallow object merge in Stroid?
2. Why is `setStoreBatch` useful even though it is not transactional rollback?
3. Why does keeping the same `createStore(..., options)` shape matter when optional features are added?

## Chapter 3 Exercises/Activities

1. Build a `wizardProgress` store with `step`, `visitedSteps`, and `completed`.
2. Write one example using `scope: "temp"` and another using `scope: "global"`. Explain why the scope choice changes the meaning.
3. Take one piece of state from a recent app and redesign it as a named Stroid store with cleaner naming.

## Chapter 3 References/Further Reading

- [docs/04-createStore.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs/04-createStore.md)
- [docs/05-setStore.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs/05-setStore.md)
- [docs/09-setStoreBatch.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs/09-setStoreBatch.md)
- [docs/18-ssr.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs/18-ssr.md)


## Navigation

- Previous: [Chapter 2: Core Options](CORE_OPTIONS.md)
- Jump to: [Unit One: Core of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-one-core-of-stroid)
- Next: [Chapter 4: Real Use of Core Stroid](REAL_USE.md)
