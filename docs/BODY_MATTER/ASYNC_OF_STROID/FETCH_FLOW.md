# Chapter 10: Fetch Flow, Retry, and Dedupe

Chapter opener

The most expensive async mistake is believing one request means one result. In reality, the system has to decide which result matters, which request still owns the right to write, and which duplicate work should never have started.

## Learning Objectives

- Understand the main `fetchStore` options.
- Learn how dedupe and last-write-wins behave.
- See how retry and abort logic interact.
- Use `refetchStore` intentionally.

## Chapter Outline

- 10.1 Fetch Options That Matter
- 10.2 Dedupe and Last-Write-Wins
- 10.3 Retry, Abort, and Refetch

## 10.1 Fetch Options That Matter

Core async options include:

- `transform`
- `onSuccess`
- `onError`
- `stateAdapter`
- `method` / `headers` / `body`
- `ttl`
- `staleWhileRevalidate`
- `dedupe`
- `retry`
- `retryDelay`
- `retryBackoff`
- `signal`
- `cacheKey`
- `responseType`
- `autoCreate`
- `cloneResult`

Note:
When `stateAdapter` is provided, the backing store must already exist.

### Example 10.1: Configured Fetch

```ts
import { fetchStore } from "stroid/async";

await fetchStore("products", "/api/products", {
  ttl: 30_000,
  staleWhileRevalidate: true,
  dedupe: true,
  retry: 2,
  retryDelay: 400,
  retryBackoff: 1.7,
  transform: (result: any) => result.items,
  autoCreate: true,
});
```

This is where the async layer stops being a thin helper and starts becoming a real policy engine.

## 10.2 Dedupe and Last-Write-Wins

Stroid does two very important things:

1. it can dedupe identical inflight requests
2. it uses last-write-wins request versioning for competing results

### Example 10.2: Dedupe

```ts
const a = fetchStore("users", "/api/users", { dedupe: true });
const b = fetchStore("users", "/api/users", { dedupe: true });

await Promise.all([a, b]);
```

With dedupe enabled, the second call can reuse the existing inflight request rather than firing a duplicate.

### Example 10.3: Cache Slot Separation

```ts
await fetchStore("products", "/api/products?page=1", {
  cacheKey: "page:1",
});

await fetchStore("products", "/api/products?page=2", {
  cacheKey: "page:2",
});
```

`cacheKey` matters because it lets one store own multiple logical request slots without confusing them.

Table 10.1: Fetch Flow Rules

| Concern | Stroid Behavior |
|---|---|
| duplicate inflight work | dedupe when enabled |
| racing results | later request version wins |
| repeated cache entries | bounded per store |
| missing backing store | async layer creates one when `autoCreate` is enabled |

## 10.3 Retry, Abort, and Refetch

Retries are not free. They are time multiplied by assumption.

That is why Stroid clamps retry settings and treats abort as a first-class outcome.

### Example 10.4: Abort-Aware Fetch

```ts
const controller = new AbortController();

await fetchStore("profile", "/api/profile", {
  signal: controller.signal,
  retry: 1,
});
```

### Example 10.5: Refetch

```ts
import { refetchStore } from "stroid/async";

await refetchStore("profile");
```

`refetchStore(name)` reuses the last registered request source and options for that store.

### Case Study 10.1: Why Retry Needs Restraint

Retry logic looks generous in docs and dangerous in production.

Without discipline, retry creates:

- request storms
- hidden latency
- wasted battery
- false confidence

That is why Stroid's async layer clamps extreme retry settings and treats non-finite values as bad input rather than clever input.

Good async systems are not the ones that keep trying forever.
They are the ones that fail predictably when continuing is no longer meaningful.

## Chapter 10 Summary

- `fetchStore` supports transform, cache, dedupe, retry, abort, and cache slot control.
- Dedupe prevents needless duplicate requests.
- Last-write-wins prevents older request results from overwriting newer intent.
- Retry must be treated as controlled policy, not hopeful repetition.

## Chapter 10 Review Questions

1. Why does `cacheKey` matter for one store with many request variants?
2. What problem does last-write-wins solve?
3. Why is retry dangerous when it is unlimited or poorly bounded?

## Chapter 10 Exercises/Activities

1. Write a `fetchStore` call for paginated products with distinct `cacheKey` values.
2. Add `signal`, `retry`, and `transform` to a request example and explain why each exists.
3. Describe a race where two async results arrive out of order and how Stroid should respond.

## Chapter 10 References/Further Reading

- [src/async.ts](/src/async.ts)
- [tests/async.test.ts](/tests/async.test.ts)


## Navigation

- Previous: [Chapter 9: Introduction to Async Stroid](INTRODUCTION.md)
- Jump to: [Unit Three: Async of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-three-async-of-stroid)
- Next: [Chapter 11: Cache, Revalidation, and Cleanup](CACHE_AND_REVALIDATION.md)

