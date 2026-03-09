# Chapter 20: Real Use of React Stroid

Chapter opener

React usage becomes mature when a component stops asking "can I read this state?" and starts asking "what is the smallest truth this component should care about?"

## Learning Objectives

- Apply React hooks to realistic UI patterns.
- Combine core stores, async stores, and field hooks coherently.
- Avoid over-subscribing components.
- Decide when Stroid's React layer is a fit.

## Chapter Outline

- 20.1 Profile and Dashboard Screens
- 20.2 Draft Forms and Async Panels
- 20.3 Honest Fit for the React Layer

## 20.1 Profile and Dashboard Screens

### Example 20.1: Profile Header

```tsx
function ProfileHeader() {
  const name = useStoreField("profile", "name");
  const role = useStoreField("profile", "role");

  return <h1>{name} - {role}</h1>;
}
```

### Example 20.2: Dashboard Summary

```tsx
function DashboardSummary() {
  const total = useSelector("cart", (state: any) => {
    return state.items.reduce((sum: number, item: any) => sum + item.price, 0);
  });

  return <p>Total: {total}</p>;
}
```

## 20.2 Draft Forms and Async Panels

### Example 20.3: Draft Form

```tsx
function ProfileDraftForm() {
  const name = useFormStore("profileDraft", "name");
  const bio = useFormStore("profileDraft", "bio");

  return (
    <>
      <input value={name.value ?? ""} onChange={name.onChange} />
      <textarea value={bio.value ?? ""} onChange={bio.onChange} />
    </>
  );
}
```

### Example 20.4: Async Panel

```tsx
function ProductsPanel() {
  const { data, loading, error } = useAsyncStore("products");

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
```

Table 20.1: React Usage Patterns

| UI Need | Best Hook |
|---|---|
| direct field | `useStoreField` |
| derived value | `useSelector` |
| async resource | `useAsyncStore` |
| form binding | `useFormStore` |
| one-time read | `useStoreStatic` |

## 20.3 Honest Fit for the React Layer

The React layer is a good fit when:

- you already want Stroid for state
- you want direct store-to-component reading
- you prefer explicit named stores over provider-heavy wiring

It is a weaker fit when:

- your app is extremely selector-heavy and ultra-granular by design
- another state layer already dominates your component architecture
- the team wants a very different subscription model

### Case Study 20.1: Why Readability Is a Performance Strategy

Performance problems often begin as readability problems.

When components subscribe too broadly, the code usually already said so.
When a component depends on too much state, the code usually already said so.

That is why readable React-state design matters:

- clear reads lead to clearer rerender boundaries
- clear rerender boundaries lead to easier debugging
- easier debugging leads to calmer teams

That chain matters more than most teams realize.

## Chapter 20 Summary

- The React layer is strongest when components subscribe precisely.
- `useStoreField`, `useSelector`, `useAsyncStore`, and `useFormStore` each have a clear domain.
- The React layer is useful, but it should still be chosen honestly against the application's architecture.

## Chapter 20 Review Questions

1. Which hook is best for a single field read, a derived summary, an async panel, and a draft form?
2. Why are readability and performance connected in React subscription design?
3. When might Stroid's React layer be the wrong fit?

## Chapter 20 Exercises/Activities

1. Design a small dashboard using `useStoreField` and `useSelector`.
2. Build a draft-form example with two fields and `useFormStore`.
3. Write a short note explaining whether your React app benefits from Stroid's hook model.

## Chapter 20 References/Further Reading

- [docs/12-react.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs/12-react.md)
- [src/hooks-core.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/hooks-core.ts)
- [src/hooks-form.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/hooks-form.ts)
- [src/hooks-async.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/hooks-async.ts)
