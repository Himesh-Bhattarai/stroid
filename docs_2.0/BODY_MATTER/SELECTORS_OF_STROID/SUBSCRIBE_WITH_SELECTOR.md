# Chapter 35: subscribeWithSelector, Equality, and Notifications

Chapter opener

Notification systems become expensive when they start treating every change as important. Equality is the discipline that tells the system which differences deserve attention.

## Learning Objectives

- Understand `subscribeWithSelector`.
- Learn how equality functions affect notification behavior.
- See how selector subscriptions differ from raw subscriptions.
- Avoid overusing selector subscriptions in places where raw reads are clearer.

## Chapter Outline

- 35.1 Selector Subscriptions
- 35.2 Equality and Serialized Fallback
- 35.3 Notification Discipline

## 35.1 Selector Subscriptions

`subscribeWithSelector` runs a selector against store updates and compares the selected value over time.

### Example 35.1: Selector Subscription

```ts
subscribeWithSelector(
  "settings",
  (state) => state.theme,
  Object.is,
  (next, prev) => {
    console.log(next, prev);
  }
);
```

## 35.2 Equality and Serialized Fallback

By default, Stroid uses `Object.is`.
For object results under default equality, it also uses a serialized fallback comparison path.

Table 35.1: Equality Read

| Equality Path | Effect |
|---|---|
| custom equality | user-defined comparison |
| `Object.is` | default primitive/reference comparison |
| serialized fallback | extra protection for object results under default equality |

## 35.3 Notification Discipline

### Figure 35.1: Selected Change, Not Whole-Store Change

```text
store update -> selector -> equality -> notify or skip
```

### Case Study 35.1: Why Too Much Precision Can Still Be Wasteful

There is a strange engineering temptation to keep slicing truth thinner and thinner.
At some point the system is no longer being precise.
It is merely being busy.

Selector subscriptions are valuable when they protect signal.
They are harmful when they multiply ceremony without reducing meaningful work.

## Chapter 35 Summary

- `subscribeWithSelector` listens to selected value changes, not just raw store changes.
- Equality strategy directly shapes notification behavior.
- Selector subscriptions should be chosen when the derived signal matters, not by default.

## Chapter 35 Review Questions

1. What does `subscribeWithSelector` compare?
2. What is the role of a custom equality function?
3. Why can extreme precision still become wasteful?

## Chapter 35 Exercises/Activities

1. Write a selector subscription with a custom equality function.
2. Compare a raw store subscription and a selector subscription for the same problem.
3. Explain when a selector-based subscription is unjustified.

## Chapter 35 References/Further Reading

- [src/selectors.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/selectors.ts)
- [tests/store.test.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/tests/store.test.ts)
