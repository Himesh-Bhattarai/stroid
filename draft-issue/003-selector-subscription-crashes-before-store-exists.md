# Selector subscriptions can throw before a store exists

Severity: high

## Summary

`subscribeWithSelector()` immediately evaluates the selector against `_stores[name]` without checking whether the store exists. This can throw if the selector expects an object.

Relevant code:

- [src/store.ts:994](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store.ts#L994)
- [src/hooks-core.ts:98](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/hooks-core.ts#L98)
- [src/hooks-core.ts:193](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/hooks-core.ts#L193)

## Why it happens

`subscribeWithSelector()` does:

`let prevSel: R = selector(_stores[name]);`

If `name` is missing, `_stores[name]` is `undefined`.

Selectors like `(s) => s.user.id` will throw immediately.

## Failure mode

This breaks the documented React hook behavior that a component can subscribe before the store exists and later update when `createStore()` is called.

The warning path in `useStore()` says exactly that, but selector-based subscription can still crash during subscription setup.

## Why this matters

- Public API crash
- React integration inconsistency
- Missing-store subscriptions become unsafe unless every selector is defensive

## Fix direction

- Guard missing stores before the initial selector evaluation
- Decide on a missing-store selector contract, likely `null` or `undefined`
- Add tests for:
  - `subscribeWithSelector()` before `createStore()`
  - `useStore(name, selector)` before `createStore()`
  - `useSelector(name, selector)` before `createStore()`
