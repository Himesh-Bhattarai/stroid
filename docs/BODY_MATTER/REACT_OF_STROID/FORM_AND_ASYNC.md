# Chapter 19: Async and Form Hooks

Chapter opener

The most useful hooks are often the ones that remove repetition without hiding the model.

## Learning Objectives

- Understand `useAsyncStore` and `useFormStore`.
- Use React hooks with async-backed stores and form fields.
- Learn where convenience is helpful and where it can become over-abstraction.
- Keep React code small without losing store clarity.

## Chapter Outline

- 19.1 `useAsyncStore`
- 19.2 `useFormStore`
- 19.3 Convenience Without Confusion

## 19.1 `useAsyncStore`

`useAsyncStore(name)` normalizes the async store shape into a React-friendly read.

### Example 19.1: Async Hook

```tsx
import { useAsyncStore } from "stroid/react";

function ProductsPanel() {
  const { data, loading, error, revalidating, isEmpty } = useAsyncStore("products");

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;
  if (isEmpty) return <p>No products yet.</p>;

  return <pre>{JSON.stringify({ data, revalidating }, null, 2)}</pre>;
}
```

This hook is useful because it removes repetitive shape unpacking while keeping the underlying async contract visible.

## 19.2 `useFormStore`

`useFormStore(storeName, field)` returns:

- `value`
- `onChange`

`onChange` reads:

- `event.target.value` for normal text-like inputs
- `event.target.checked` for checkbox inputs

### Example 19.2: Form Hook

```tsx
import { useFormStore } from "stroid/react";

function NameField() {
  const { value, onChange } = useFormStore("profileDraft", "name");
  return <input value={value ?? ""} onChange={onChange} />;
}
```

This is a small helper, but it matters because repeated field wiring is exactly the kind of friction that slowly pollutes UI codebases.

Note:
Checkboxes are where innocent form helpers become accidental liars.
If you read the raw browser `value`, you often get `"on"`.
`useFormStore(...)` uses `checked` for checkbox inputs so the store receives a real boolean.

## 19.3 Convenience Without Confusion

Convenience hooks should make the code shorter without making the model less visible.

Table 19.1: React Convenience Hooks

| Hook | Convenience | Still Visible |
|---|---|---|
| `useAsyncStore` | async shape unpacking | yes |
| `useFormStore` | form field wiring | yes |

### Case Study 19.1: Why Small Convenience Matters

Developers often underestimate the cost of repeated glue code.

It does not fail loudly.
It just slowly makes the codebase more annoying to maintain.

Small conveniences are justified when they:

- remove repetition
- preserve meaning
- avoid creating a second mental model

That is the right test for these hooks.

## Chapter 19 Summary

- `useAsyncStore` is the React-friendly read for async-backed stores.
- `useFormStore` reduces repetitive input wiring for store-backed forms.
- These hooks are useful because they compress repetition without hiding the runtime model.

## Chapter 19 Review Questions

1. What does `useAsyncStore` normalize for React code?
2. Why is `useFormStore` useful without being magical?
3. What makes a convenience hook good instead of confusing?

## Chapter 19 Exercises/Activities

1. Build a small form using `useFormStore`.
2. Render an async-backed store with `useAsyncStore`.
3. Explain why convenience should never replace understanding.

## Chapter 19 References/Further Reading

- [src/hooks-async.ts](/src/hooks-async.ts)
- [src/hooks-form.ts](/src/hooks-form.ts)
- [src/async.ts](/src/async.ts)


## Navigation

- Previous: [Chapter 18: Hooks, Selectors, and Render Precision](HOOKS.md)
- Jump to: [Unit Five: React of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-five-react-of-stroid)
- Next: [Chapter 20: Real Use of React Stroid](REAL_USE.md)

