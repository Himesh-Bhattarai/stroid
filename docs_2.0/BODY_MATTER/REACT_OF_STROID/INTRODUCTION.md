# Unit Five: React of Stroid

Unit opener

React state code becomes easier to write long before it becomes easier to reason about. A hook can feel elegant while still hiding broad subscriptions, unstable derived values, or accidental rendering costs.

This unit explains Stroid's React layer as it actually exists: a thin but opinionated bridge between named stores and component rendering.

## Unit Objectives

- Understand what `stroid/react` exports.
- Learn how the React hooks map onto Stroid stores.
- Distinguish broad subscriptions from precise subscriptions.
- Use the React layer intentionally instead of treating it as automatic convenience.

# Chapter 17: Introduction to React Stroid

Chapter opener

React hooks feel small, but they quietly define what your component believes is worth noticing.

## Learning Objectives

- Define the role of the React layer.
- Understand why React is a dedicated subpath.
- Learn the major hooks in `stroid/react`.
- See why precision matters more in React than in core reads.

## Chapter Outline

- 17.1 What the React Layer Is
- 17.2 The Main Hook Surface
- 17.3 Why React Is Kept Separate

## 17.1 What the React Layer Is

Import path:

```ts
import { useStore, useStoreField, useSelector, useStoreStatic, useAsyncStore, useFormStore } from "stroid/react";
```

The React layer does not change how stores are created.
It changes how components consume them.

That includes:

- store subscription
- snapshot reading
- derived selection
- async state consumption
- form field binding

### Example 17.1: Smallest React Read

```tsx
import { useStore } from "stroid/react";

function ProfileCard() {
  const profile = useStore("profile");
  return <pre>{JSON.stringify(profile)}</pre>;
}
```

## 17.2 The Main Hook Surface

Table 17.1: React Hook Surface

| Hook | Main Role |
|---|---|
| `useStore` | read a store, path, or selector result |
| `useStoreField` | read one named field |
| `useSelector` | derive a value with default shallow equality |
| `useStoreStatic` | read without ongoing subscription |
| `useAsyncStore` | consume async store shape |
| `useFormStore` | field binding convenience |

### Example 17.2: Precise Field Read

```tsx
import { useStoreField } from "stroid/react";

function ThemeBadge() {
  const mode = useStoreField("theme", "mode");
  return <span>{mode}</span>;
}
```

## 17.3 Why React Is Kept Separate

React should not be part of lean core because:

- not every Stroid environment is React
- React has its own runtime cost
- component subscription behavior is a separate concern from store creation

### Figure 17.1: Core and React Stay Close, Not Fused

```ts
import { createStore } from "stroid";
import { useStore } from "stroid/react";
```

That separation is clean:

- core owns store behavior
- React owns component subscription behavior

### Case Study 17.1: Why Broad Reads Feel Fine Until They Are Not

A component that subscribes to an entire store often feels harmless at first.
The UI works.
The code is short.

Then the store grows.
Then re-renders spread.
Then performance becomes a social problem because every new field quietly affects more components than intended.

That is why React documentation must teach restraint, not only capability.

## Chapter 17 Summary

- `stroid/react` is the component-consumption layer for Stroid stores.
- It exposes six main hooks, each with a different subscription purpose.
- React stays separate from core because rendering is its own problem space.
- Precise subscriptions matter more than they appear to at first glance.

## Chapter 17 Review Questions

1. Why is `stroid/react` not part of lean core?
2. What problem does `useStoreField` solve that `useStore` can make easier to miss?
3. Why can broad store subscriptions become expensive over time?

## Chapter 17 Exercises/Activities

1. Rewrite a whole-store `useStore("user")` read into more precise hook usage.
2. List which React hooks you would use for a profile screen, form, and async list.
3. Explain why "the component still works" is not a strong enough React design test.

## Chapter 17 References/Further Reading

- [src/hooks.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/hooks.ts)
- [src/hooks-core.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/hooks-core.ts)
- [docs/12-react.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs/12-react.md)


## Navigation

- Previous: [Chapter 16: Real Use of Sync Stroid](../SYNC_OF_STROID/REAL_USE.md)
- Jump to: [Unit Five: React of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-five-react-of-stroid)
- Next: [Chapter 18: Hooks, Selectors, and Render Precision](HOOKS.md)
