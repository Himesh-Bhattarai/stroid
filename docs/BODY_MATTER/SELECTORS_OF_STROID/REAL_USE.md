# Chapter 36: Real Use of Selectors Stroid

Chapter opener

The right selector use feels surgical. The wrong selector use feels intellectual. One reduces noise. The other only performs nuance.

## Learning Objectives

- Decide when selectors help and when they overcomplicate.
- Use selectors alongside React and non-React consumers.
- Recognize stronger and weaker selector fits.
- Connect selector use back to performance reality.

## Chapter Outline

- 36.1 Good Selector Targets
- 36.2 Weak Selector Targets
- 36.3 Honest Fit for Selectors

## 36.1 Good Selector Targets

Good selector targets include:

- meaningful derived totals
- combined display strings
- focused derived flags used in subscriptions

### Example 36.1: Cart Summary

```ts
const expensiveCount = createSelector("cart", (state: any) => {
  return state.items.filter((item: any) => item.price > 100).length;
});
```

## 36.2 Weak Selector Targets

Weak targets include:

- simple single-field reads better handled by paths
- derived values no one reuses
- selectors added only because they feel sophisticated

Table 36.1: Selector Fit

| Situation | Fit |
|---|---|
| reusable derived read | strong |
| derived subscription signal | strong |
| single nested field read | weak |
| forced micro-optimization habit | weak |

## 36.3 Honest Fit for Selectors

### Case Study 36.1: Why Smaller Truth Is Not Always Better Truth

The human mind confuses narrower with smarter.
That is why selector-heavy designs can feel advanced even when they only add machinery.

A selector earns its place when it clarifies dependency.
If it only decorates it, the selector is vanity.

## Chapter 36 Summary

- Selectors are strongest for reusable derived value boundaries.
- Simple field reads often do not need them.
- Selector use should be justified by dependency clarity, not aesthetic cleverness.

## Chapter 36 Review Questions

1. Which kinds of reads are good selector targets?
2. Why is a single field often better handled without a selector?
3. What makes a selector vanity instead of value?

## Chapter 36 Exercises/Activities

1. Replace one unnecessary selector with a simpler path read.
2. Write one selector that is worth reusing in multiple places.
3. Explain whether your app needs a selector-heavy style at all.

## Chapter 36 References/Further Reading

- [Performance and Reality](../THE_GLITCH_IN_MATRIX/PERFORMANCE_AND_REALITY.md)


## Navigation

- Previous: [Chapter 35: subscribeWithSelector, Equality, and Notifications](SUBSCRIBE_WITH_SELECTOR.md)
- Jump to: [Unit Nine: Selectors of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-nine-selectors-of-stroid)
- Next: [Chapter 37: Introduction to Runtime Operations](../RUNTIME_OPERATIONS_OF_STROID/INTRODUCTION.md)

