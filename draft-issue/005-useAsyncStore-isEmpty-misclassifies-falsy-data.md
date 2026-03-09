# useAsyncStore().isEmpty misclassifies valid falsy payloads as empty

Severity: medium

## Summary

`useAsyncStore()` computes `isEmpty` with a truthiness check on `store?.data`.

Relevant code:

- [src/hooks-async.ts:3](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/hooks-async.ts#L3)

## Why it happens

Current logic:

`isEmpty: !store?.data && !store?.loading && !store?.error`

This treats valid payloads like `0`, `false`, and `""` as empty.

## Failure mode

If a request legitimately returns:

- `0`
- `false`
- `""`

the hook reports `isEmpty === true` even though the fetch succeeded and `data` is valid.

## Why this matters

This is a UI-facing logic bug and can easily cause incorrect empty-state rendering in real apps.

## Fix direction

- Define emptiness explicitly, likely `data == null`
- Add tests covering successful fetches returning `0`, `false`, and `""`
