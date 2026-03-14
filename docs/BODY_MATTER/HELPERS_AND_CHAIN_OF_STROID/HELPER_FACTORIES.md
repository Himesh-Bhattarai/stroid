# Chapter 46: Helper Factories

Chapter opener

Factories are useful when they remove boilerplate. They become risky when they start becoming a substitute for understanding the state model they generate.

## Learning Objectives

- Understand each helper factory.
- Learn what store shapes they create.
- See where helpers reduce repetition.
- Use helper factories without surrendering explicit design.

## Chapter Outline

- 46.1 `createCounterStore`
- 46.2 `createListStore`
- 46.3 `createEntityStore`

## 46.1 `createCounterStore`

`createCounterStore` creates a store with a `value` field and returns convenience methods.

### Example 46.1: Counter Helper

```ts
const counter = createCounterStore("count");
counter.inc();
counter.dec();
```

## 46.2 `createListStore`

`createListStore` creates `{ items: [] }` with push/remove/replace helpers.

### Example 46.2: List Helper

```ts
const todos = createListStore<string>("todos");
todos.push("write docs");
```

## 46.3 `createEntityStore`

`createEntityStore` manages `{ entities, ids }`.

Table 46.1: Helper Factories

| Helper | Generated Shape |
|---|---|
| `createCounterStore` | `{ value }` |
| `createListStore` | `{ items }` |
| `createEntityStore` | `{ entities, ids }` |

### Case Study 46.1: Why Helpers Should Remove Repetition, Not Thought

The psychological comfort of a helper is real.
It reduces typing and makes common patterns feel safe.
But if a helper causes the team to forget the actual store shape, the comfort becomes debt.

## Chapter 46 Summary

- Helper factories generate opinionated store shapes.
- They are useful for common patterns like counters, lists, and entities.
- They should reduce repetition without replacing understanding.

## Chapter 46 Review Questions

1. What store shapes do the helper factories create?
2. When is `createEntityStore` a better fit than a generic object store?
3. Why should helpers not replace understanding?

## Chapter 46 Exercises/Activities

1. Build a todo list with `createListStore`.
2. Build a simple catalog with `createEntityStore`.
3. Explain when you would avoid helpers and just use core APIs directly.

## Chapter 46 References/Further Reading

- [src/helpers.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/helpers.ts)


## Navigation

- Previous: [Chapter 45: Introduction to Helpers and Chain](INTRODUCTION.md)
- Jump to: [Unit Twelve: Helpers and Chain of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-twelve-helpers-and-chain-of-stroid)
- Next: [Chapter 47: The Chain API](CHAIN_API.md)
