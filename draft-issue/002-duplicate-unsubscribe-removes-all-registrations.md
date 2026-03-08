# Duplicate subscriber registrations cannot be independently unsubscribed

Severity: medium

## Summary

Stroid currently allows duplicate subscriber registrations, but the unsubscribe function removes all registrations for the same callback reference, not just the one being unsubscribed.

Relevant code:

- [src/store.ts:858](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store.ts#L858)

## Why it happens

`_subscribe()` stores subscribers in an array and returns:

`_subscribers[name] = _subscribers[name].filter((s) => s !== fn);`

If the same callback was registered twice, unsubscribing either handle removes both entries.

## Failure mode

```ts
const off1 = subscribe(cb);
const off2 = subscribe(cb);

off1();
// Expected if duplicates are allowed:
// one registration remains
// Actual:
// both registrations are removed
```

## Why this matters

The library already codified "duplicates are allowed" as behavior. The current unsubscribe implementation violates that contract and makes duplicate registration semantics inconsistent.

## Fix direction

- Remove only the first matching entry for a given unsubscribe handle.
- Add a test covering:
  - same function subscribed twice
  - first unsubscribe removes only one slot
  - second unsubscribe removes the remaining slot
