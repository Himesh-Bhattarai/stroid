# Chapter 7: Runtime Layers

Chapter opener

Not every feature belongs inside store creation. Some capabilities belong to how stores are consumed, observed, or orchestrated over time. That is where runtime layers come in.

## Learning Objectives

- Understand the role of `stroid/react`, `stroid/async`, and `stroid/selectors`.
- Learn which runtime layers are store consumers and which are store producers.
- See how selector logic differs from plain store subscriptions.
- Understand why these modules stay out of lean core.

## Chapter Outline

- 7.1 React Bindings
- 7.2 Async Store Orchestration
- 7.3 Selectors as an Explicit Layer

## 7.1 React Bindings

Import path:

```ts
import { useStore, useStoreField, useSelector, useStoreStatic, useAsyncStore, useFormStore } from "stroid/react";
```

The React layer adapts Stroid stores into component consumption patterns.

### Example 7.1: Reading a Whole Store

```tsx
import { useStore } from "stroid/react";

function ProfileCard() {
  const profile = useStore("profile");
  return <pre>{JSON.stringify(profile)}</pre>;
}
```

### Example 7.2: Field and Selector Reads

```tsx
import { useStoreField, useSelector } from "stroid/react";

function ThemeBadge() {
  const mode = useStoreField("theme", "mode");
  const label = useSelector("theme", (state: any) => `${state.mode} mode`);
  return <span>{mode} / {label}</span>;
}
```

The React layer also includes:

- `useStoreStatic` for snapshot-style reads without ongoing subscription
- `useAsyncStore` for async state shape consumption
- `useFormStore` for field binding convenience

## 7.2 Async Store Orchestration

Import path:

```ts
import { fetchStore, refetchStore, enableRevalidateOnFocus, getAsyncMetrics } from "stroid/async";
```

Async is not a store-attached feature like persistence. It is an orchestration layer that creates and updates stores through a request workflow.

### Example 7.3: Fetch Into a Store

```ts
import { fetchStore } from "stroid/async";

await fetchStore("products", "/api/products", {
  ttl: 30_000,
  staleWhileRevalidate: true,
  dedupe: true,
  retry: 2,
  autoCreate: true,
});
```

Note:
`fetchStore` only auto-creates a backing store when `autoCreate` is enabled (or configured globally). Otherwise, create the store first or provide a `stateAdapter`.

### Example 7.4: Revalidation and Metrics

```ts
import { enableRevalidateOnFocus, getAsyncMetrics, refetchStore } from "stroid/async";

enableRevalidateOnFocus("products");
await refetchStore("products");

console.log(getAsyncMetrics());
```

Async owns concerns such as:

- inflight dedupe
- retries and backoff
- cache slots
- stale-while-revalidate
- focus and online revalidation
- async metrics

## 7.3 Selectors as an Explicit Layer

Import path:

```ts
import { createSelector, subscribeWithSelector } from "stroid/selectors";
```

Selectors are intentionally not in lean core now. That is the right boundary because selector logic is useful, but not required for the base named-store runtime.

### Example 7.5: Derived Selector

```ts
import { createSelector } from "stroid/selectors";

const selectThemeLabel = createSelector("theme", (state: any) => {
  return `${state.mode} mode`;
});

console.log(selectThemeLabel());
```

### Example 7.6: Subscribe to Derived State

```ts
import { subscribeWithSelector } from "stroid/selectors";

const unsubscribe = subscribeWithSelector(
  "profile",
  (state: any) => state.name,
  Object.is,
  () => {
    console.log("name changed");
  }
);
```

Table 7.1: Runtime Layer Imports

| Import | Main Role | Best Use |
|---|---|---|
| `stroid/react` | component consumption | React apps |
| `stroid/async` | request-driven store orchestration | API-backed state |
| `stroid/selectors` | derived subscriptions and memoized reads | performance-aware derived state |

### Case Study 7.1: Why These Stay Separate

React, async, and selectors are important, but they are not universal. Not every store lives in React. Not every project wants the built-in async opinion. Not every consumer wants selector abstraction.

Keeping them split preserves freedom without losing first-party guidance.

That is an architectural maturity move: the library says, "here is the official way," but it does not force every app to pay for every layer.

## Chapter 7 Summary

- `stroid/react`, `stroid/async`, and `stroid/selectors` are runtime layers, not core.
- React focuses on consumption, async focuses on orchestration, and selectors focus on derived observation.
- These modules stay outside lean core because they are valuable but not universal.
- Stroid's package shape keeps them first-party without pretending they are mandatory.

## Chapter 7 Review Questions

1. Why is `stroid/async` different from store-attached features like `persist`?
2. What is the advantage of keeping selectors in their own subpath?
3. When would `useStoreField` be more appropriate than `useStore`?

## Chapter 7 Exercises/Activities

1. Create one React example using `useStoreField` and one using `useSelector`.
2. Build an async example with `fetchStore`, then add `enableRevalidateOnFocus`.
3. Write a derived selector for a profile or cart store and explain why it belongs in `stroid/selectors`.

## Chapter 7 References/Further Reading

- [src/hooks.ts](/src/hooks.ts)
- [src/async.ts](/src/async.ts)
- [src/selectors-entry.ts](/src/selectors-entry.ts)
- [Chapter 17: Introduction to React Stroid](../REACT_OF_STROID/INTRODUCTION.md)
- [Chapter 9: Introduction to Async Stroid](../ASYNC_OF_STROID/INTRODUCTION.md)


## Navigation

- Previous: [Chapter 6: Store-Attached Features](STORE_FEATURES.md)
- Jump to: [Unit Two: Opt-In Features of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-two-opt-in-features-of-stroid)
- Next: [Chapter 8: Power Tools and Utility Subpaths](POWER_TOOLS.md)

