# Chapter 18: Hooks, Selectors, and Render Precision

Chapter opener

In React, what you subscribe to is a quiet statement about what your component believes is important.

## Learning Objectives

- Use `useStore`, `useStoreField`, and `useSelector` correctly.
- Understand path reads versus selector reads.
- Learn why selector precision and equality functions matter.
- Avoid broad subscriptions when fine-grained subscriptions are better.

## Chapter Outline

- 18.1 `useStore`
- 18.2 `useStoreField` and `useSelector`
- 18.3 Render Precision as Design Discipline

## 18.1 `useStore`

`useStore` supports:

- full-store reads
- path reads
- selector reads

### Example 18.1: Full Store Read

```tsx
const user = useStore("user");
```

### Example 18.2: Path Read

```tsx
const city = useStore("user", "address.city");
```

### Example 18.3: Selector Read

```tsx
const fullName = useStore("user", (state: any) => {
  return `${state.firstName} ${state.lastName}`;
});
```

These all work, but they do not all cost the same in render behavior.

## 18.2 `useStoreField` and `useSelector`

`useStoreField` is the clearest option when a component really needs one field.

### Example 18.4: Field Hook

```tsx
const theme = useStoreField("settings", "theme");
```

`useSelector` is stronger when the component needs a derived value with equality-aware rendering.

### Example 18.5: Derived Selection

```tsx
const expensiveItems = useSelector("cart", (state: any) => {
  return state.items.filter((item: any) => item.price > 100);
});
```

Table 18.1: Reading Strategies

| Pattern | Best Use | Risk |
|---|---|---|
| `useStore("name")` | quick whole-store read | broad re-render scope |
| `useStore("name", "path")` | direct field or nested field | lower risk |
| `useStoreField(...)` | explicit field read | low ambiguity |
| `useSelector(...)` | derived values | depends on selector quality |

## 18.3 Render Precision as Design Discipline

React rendering problems rarely announce themselves dramatically at first.
They usually begin as unnoticed over-subscription.

### Figure 18.1: Broad vs Precise Subscription

```tsx
// broad
const user = useStore("user");

// precise
const name = useStoreField("user", "name");
```

The second version is not just a micro-optimization.
It is clearer code.

### Case Study 18.1: Why Precision Changes Team Behavior

When a codebase normalizes broad subscription habits, every new field becomes socially expensive.

One innocent update can:

- rerender too much UI
- make profiling harder
- blur ownership

When a codebase normalizes precise subscription habits, teams think more carefully about what a component actually depends on.

That is not only a performance choice.
It is a psychological choice about how much ambiguity the team tolerates.

## Chapter 18 Summary

- `useStore` is flexible, but flexibility should not replace precision.
- `useStoreField` is the clearest field-focused hook.
- `useSelector` is for derived reads and render-aware comparison.
- Render precision is part of code clarity, not only performance tuning.

## Chapter 18 Review Questions

1. When should you prefer `useStoreField` over `useStore("name")`?
2. What is the difference between path reads and selector reads?
3. Why is subscription precision a design discipline?

## Chapter 18 Exercises/Activities

1. Rewrite a broad store subscription into two precise subscriptions.
2. Write a selector for cart totals or full-name formatting.
3. Explain which hook you would choose for a badge, a profile header, and a derived summary panel.

## Chapter 18 References/Further Reading

- [src/hooks-core.ts](/src/hooks-core.ts)
- [src/selectors.ts](/src/selectors.ts)


## Navigation

- Previous: [Chapter 17: Introduction to React Stroid](INTRODUCTION.md)
- Jump to: [Unit Five: React of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-five-react-of-stroid)
- Next: [Chapter 19: Async and Form Hooks](FORM_AND_ASYNC.md)

