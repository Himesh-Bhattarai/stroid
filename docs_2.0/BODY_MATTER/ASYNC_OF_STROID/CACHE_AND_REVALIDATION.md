# Chapter 11: Cache, Revalidation, and Cleanup

Chapter opener

Caching is not only about speed. It is about deciding when old truth is still useful and when old truth becomes a lie.

## Learning Objectives

- Understand TTL and stale-while-revalidate behavior.
- Learn how focus and online revalidation work.
- See how cleanup is tied to store deletion.
- Use async metrics to inspect behavior.

## Chapter Outline

- 11.1 TTL and Stale-While-Revalidate
- 11.2 Focus and Online Revalidation
- 11.3 Cleanup and Metrics

## 11.1 TTL and Stale-While-Revalidate

Stroid's async layer supports TTL-based cache reuse and optional background refresh.

### Example 11.1: Cached Fetch

```ts
await fetchStore("news", "/api/news", {
  ttl: 60_000,
});
```

### Example 11.2: Cached Fetch With Revalidation

```ts
await fetchStore("news", "/api/news", {
  ttl: 60_000,
  staleWhileRevalidate: true,
});
```

When stale-while-revalidate is enabled:

- cached data can be served immediately
- the store marks revalidation in progress
- fresh data can replace it afterward

Table 11.1: Cache Modes

| Mode | Immediate Data | Background Refresh | Typical Use |
|---|---|---|---|
| no TTL | No | No | one-shot request |
| TTL only | Yes, while fresh | No | short-lived cache |
| TTL + staleWhileRevalidate | Yes | Yes | UI that values continuity |

## 11.2 Focus and Online Revalidation

Import:

```ts
import { enableRevalidateOnFocus } from "stroid/async";
```

### Example 11.3: Revalidate One Store

```ts
enableRevalidateOnFocus("news");
```

### Example 11.4: Revalidate All Registered Async Stores

```ts
enableRevalidateOnFocus();
```

This attaches focus and online listeners and reuses the last async fetch registration.

That is useful because people do not experience freshness as a technical event.
They experience it as trust.

If a user returns to a tab and the system still shows stale data without even trying to refresh, trust erodes quietly.

## 11.3 Cleanup and Metrics

Async state is tied to store lifetime. When a store is deleted, the async layer cleans up:

- request registry state
- cache metadata
- inflight metadata
- revalidate handlers
- cleanup subscriptions

### Example 11.5: Async Metrics

```ts
import { getAsyncMetrics } from "stroid/async";

console.log(getAsyncMetrics());
```

Metrics include:

- `cacheHits`
- `cacheMisses`
- `dedupes`
- `requests`
- `failures`
- `avgMs`
- `lastMs`

### Case Study 11.1: Why Cleanup Is Part of Correctness

Developers often think cleanup is a memory problem.
It is also a truth problem.

If stale async metadata survives after the store should be gone, then:

- a refetch may target the wrong lifetime
- a cleanup subscription may fire for dead state
- metrics may describe a store that no longer exists

That is why cleanup is not a side detail. It is part of whether the runtime is still describing reality.

## Chapter 11 Summary

- TTL and stale-while-revalidate solve different freshness problems.
- Focus and online revalidation let stores refresh when user attention returns.
- Async cleanup is tied to store lifetime and is part of correctness.
- Metrics make async behavior inspectable instead of mystical.

## Chapter 11 Review Questions

1. What is the difference between TTL caching and stale-while-revalidate?
2. Why does focus revalidation matter for user trust?
3. Why is cleanup part of correctness, not only part of memory safety?

## Chapter 11 Exercises/Activities

1. Write a news or feed example that uses `ttl` and `staleWhileRevalidate`.
2. Add `enableRevalidateOnFocus()` to an example and explain which store should own it.
3. Read `getAsyncMetrics()` and describe what a high dedupe count means.

## Chapter 11 References/Further Reading

- [src/async.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/async.ts)
- [tests/async.test.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/tests/async.test.ts)
