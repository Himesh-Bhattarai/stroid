# Chapter 12: Real Use of Async Stroid

Chapter opener

Async state is where a product stops being a static program and starts negotiating with reality. That negotiation must be explicit, or the UI becomes a machine for false confidence.

## Learning Objectives

- Apply the async layer to real product scenarios.
- Separate local UI state from remote async state clearly.
- Decide when Stroid async is a fit and when another tool may be better.
- Use async patterns without making every store look like a network request.

## Chapter Outline

- 12.1 Search and Feed Workflows
- 12.2 Profile and Session Workflows
- 12.3 When Not to Use Async Stroid

## 12.1 Search and Feed Workflows

Async Stroid works well when you want remote data to remain first-class state in the same store world as the rest of the app.

### Example 12.1: Search Results

```ts
createStore("searchFilters", {
  q: "",
  page: 1,
}, {
  scope: "request",
});

await fetchStore("searchResults", "/api/search?q=books&page=1", {
  cacheKey: "books:1",
  ttl: 15_000,
  staleWhileRevalidate: true,
  autoCreate: true,
});
```

This separation is healthy:

- one store for local intent
- one store for remote result state

## 12.2 Profile and Session Workflows

### Example 12.2: Current User Profile

```ts
await fetchStore("currentUser", "/api/me", {
  ttl: 60_000,
  retry: 1,
  autoCreate: true,
});
```

### Example 12.3: Consuming Through React

```tsx
import { useAsyncStore } from "stroid/react";

function CurrentUserPanel() {
  const { data, loading, error, revalidating } = useAsyncStore("currentUser");

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return <pre>{JSON.stringify({ data, revalidating }, null, 2)}</pre>;
}
```

The async layer works best when a remote resource deserves its own clear runtime identity.

## 12.3 When Not to Use Async Stroid

Do not use the async layer just because it exists.

It is not the best fit when:

- your team already standardized on another async query system
- you need a much richer query graph than store-oriented orchestration
- your data needs are deeply normalized and relational
- you want the smallest possible abstraction around raw fetch

### Case Study 12.1: Honest Fit

The strongest engineering decisions are often subtractive.

If a library can solve a problem, that does not automatically mean it should.

Use Async Stroid when:

- you want remote state inside the same store mental model
- you want first-party cache, dedupe, and retry behavior
- you want fewer conceptual layers in the app

Skip Async Stroid when:

- another async tool already defines your architecture better
- the team would gain more from consistency than from feature consolidation

That honesty matters because good documentation should help someone reject the tool when rejection is the right technical choice.

## Chapter 12 Summary

- Async Stroid works well when remote resources should behave like first-class store state.
- Separating local intent stores from remote result stores keeps async code cleaner.
- `useAsyncStore` gives React a direct read of the async state contract.
- The async layer is useful, but not mandatory, and not always the best fit.

## Chapter 12 Review Questions

1. Why should local filter state and remote result state usually live in separate stores?
2. When is Async Stroid a good fit?
3. What are signs that another async tool may be a better fit?

## Chapter 12 Exercises/Activities

1. Model a product search screen with one local store and one async result store.
2. Build a profile example with `fetchStore` and `useAsyncStore`.
3. Write a short decision note explaining whether your app should use Async Stroid or another async layer.

## Chapter 12 References/Further Reading

- [Chapter 9: Introduction to Async Stroid](INTRODUCTION.md)
- [src/hooks-async.ts](/src/hooks-async.ts)
- [src/async.ts](/src/async.ts)


## Navigation

- Previous: [Chapter 11: Cache, Revalidation, and Cleanup](CACHE_AND_REVALIDATION.md)
- Jump to: [Unit Three: Async of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-three-async-of-stroid)
- Next: [Chapter 13: Introduction to Sync Stroid](../SYNC_OF_STROID/INTRODUCTION.md)

