# Chapter 34: createSelector and Dependency Tracking

Chapter opener

Dependency tracking is a quiet form of memory. The selector remembers what it looked at so it can decide whether the next version of reality is meaningfully different.

## Learning Objectives

- Understand how `createSelector` behaves.
- Learn what dependency tracking means in practice.
- See where `createSelector` is strong and where it is fragile.
- Use reusable selectors without romanticizing them.

## Chapter Outline

- 34.1 What `createSelector` Returns
- 34.2 Dependency Tracking
- 34.3 Cost and Limits

## 34.1 What `createSelector` Returns

`createSelector(storeName, selectorFn)` returns a function you can call later to read the selected value.

### Example 34.1: Reusable Derived Reader

```ts
const cartTotal = createSelector("cart", (state: any) => {
  return state.items.reduce((sum: number, item: any) => sum + item.price, 0);
});

const total = cartTotal();
```

## 34.2 Dependency Tracking

Stroid tracks accessed leaf paths during selector execution and reuses the last result when tracked paths did not change.

Table 34.1: `createSelector` Mental Model

| Step | Purpose |
|---|---|
| wrap state with proxy | observe access |
| run selector | capture result and dependencies |
| compare tracked paths on next read | decide reuse or recompute |

## 34.3 Cost and Limits

### Figure 34.1: Tracking Adds Intelligence and Cost

```text
more precise reuse -> more bookkeeping
```

### Case Study 34.1: Why Cleverness Should Stay Earned

A selector that saves work is useful.
A selector that exists only because it feels advanced is usually a sign that the team is performing sophistication instead of solving a dependency problem.

The mind likes cleverness because cleverness feels like control.
Good engineering asks whether the cleverness paid rent.

## Chapter 34 Summary

- `createSelector` returns a reusable derived reader.
- It tracks dependencies through observed access paths.
- That intelligence has cost and should be used where the reuse matters.

## Chapter 34 Review Questions

1. What does `createSelector` return?
2. How does dependency tracking help avoid unnecessary recompute?
3. Why can selector cleverness become performative instead of useful?

## Chapter 34 Exercises/Activities

1. Build a selector for a cart total or full display name.
2. Explain which dependencies that selector is likely to track.
3. Describe a case where `getStore(path)` is simpler and better.

## Chapter 34 References/Further Reading

- [src/selectors.ts](/src/selectors.ts)
- [src/internals/selector-store.ts](/src/internals/selector-store.ts)


## Navigation

- Previous: [Chapter 33: Introduction to Selectors Stroid](INTRODUCTION.md)
- Jump to: [Unit Nine: Selectors of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-nine-selectors-of-stroid)
- Next: [Chapter 35: subscribeWithSelector, Equality, and Notifications](SUBSCRIBE_WITH_SELECTOR.md)

