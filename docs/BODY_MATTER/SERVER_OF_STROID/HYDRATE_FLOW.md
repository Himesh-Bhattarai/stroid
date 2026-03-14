# Chapter 43: Snapshot and Hydrate Flow

Chapter opener

Hydration is the moment a prepared story becomes shared truth. That transition deserves more respect than most codebases give it.

## Learning Objectives

- Understand how `hydrate()` connects request buffers to real stores.
- Learn where `hydrateStores` fits.
- See what the current SSR contract supports and what it does not.
- Avoid imagining hydration as an all-purpose server-state abstraction.

## Chapter Outline

- 43.1 From Buffer to Store
- 43.2 The Role of `hydrateStores`
- 43.3 Honest SSR Boundary

## 43.1 From Buffer to Store

`hydrate()` applies the buffered snapshot into actual stores using `hydrateStores`.
It also carries forward any per-store options that were buffered through `createStoreForRequest(...).create(name, data, options)`.

### Example 43.1: Hydrate Request State

```ts
const requestState = createStoreForRequest(({ create }) => {
  create("session", { user: { id: "u1" } }, {
    validate: (next: any) => typeof next?.user?.id === "string",
  });
});

requestState.hydrate(() => renderApp());
```

If you call `hydrate(...)` with explicit per-store options, those hydrate-time options override the buffered ones.
`hydrate(renderFn, options?)` runs the render function inside the request registry context and applies the buffered snapshot via `hydrateStores`.

## 43.2 The Role of `hydrateStores`

Hydration is part of core, but request preparation is part of the server subpath.

Table 43.1: Buffer and Hydrate Roles

| Layer | Responsibility |
|---|---|
| `stroid/server` | request-local preparation, including staged per-store options |
| core hydration | apply prepared state to stores and create missing ones with the resolved option set |

## 43.3 Honest SSR Boundary

### Case Study 43.1: Why One SSR Path Is Better Than Two Half-Truths

The current honest Stroid story is not "SSR in every style."
It is "request-local buffering plus explicit hydration."

That is a narrower claim.
It is also a better one because it is actually supportable.

## Chapter 43 Summary

- `hydrate()` publishes request-buffered state through core hydration.
- Request preparation and store hydration are related but distinct layers.
- The SSR story is intentionally narrower than a generic server-state promise.

## Chapter 43 Review Questions

1. What is the relationship between `createStoreForRequest` and `hydrateStores`?
2. Why is the SSR story intentionally narrow?
3. Why is explicit hydration healthier than vague server-state magic?

## Chapter 43 Exercises/Activities

1. Draw the flow from request buffer to hydrated store.
2. Explain which part belongs to `stroid/server` and which belongs to core.
3. Describe a bug that explicit hydration helps avoid.

## Chapter 43 References/Further Reading

- [src/server.ts](/src/server.ts)
- [src/store.ts](/src/store.ts)


## Navigation

- Previous: [Chapter 42: Request Scope and Buffered Mutation](REQUEST_SCOPE.md)
- Jump to: [Unit Eleven: Server of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-eleven-server-of-stroid)
- Next: [Chapter 44: Real Use of Server Stroid](REAL_USE.md)

