# Chapter 38: Inspection Tools and Registry Visibility

Chapter opener

Visibility is valuable only when it creates understanding instead of voyeurism. A registry API should help you reason, not merely stare.

## Learning Objectives

- Understand each `runtime-tools` export.
- Learn what registry visibility is good for.
- See where these APIs are helpful in admin and diagnostics work.
- Avoid misusing inspection as ordinary app flow.

## Chapter Outline

- 38.1 `listStores`
- 38.2 `getStoreMeta`, `getInitialState`, and `getMetrics`
- 38.3 When Inspection Helps

## 38.1 `listStores`

`listStores()` returns current registered store names.

### Example 38.1: Registry Listing

```ts
const names = listStores();
```

## 38.2 `getStoreMeta`, `getInitialState`, and `getMetrics`

These APIs expose registry-backed metadata.

Table 38.1: Inspection API Surface

| API | Purpose |
|---|---|
| `listStores()` | current store names |
| `getStoreMeta(name)` | store metadata |
| `getInitialState()` | map of initial states |
| `getMetrics(name)` | per-store metrics if available |

## 38.3 When Inspection Helps

### Case Study 38.1: The Difference Between Monitoring and Living in the Dashboard

Inspection tools help when they answer questions that normal store reads should not answer.
They hurt when product code starts depending on registry introspection as if the registry itself were the user-facing model.

## Chapter 38 Summary

- `runtime-tools` exposes four read/inspect APIs.
- These are best suited to diagnostics, admin panels, and operational understanding.
- Inspection should not quietly become the primary application model.

## Chapter 38 Review Questions

1. What does `getInitialState()` return?
2. Why are inspection APIs different from normal app reads?
3. When does registry visibility become misuse?

## Chapter 38 Exercises/Activities

1. Sketch a simple admin page using `listStores` and `getStoreMeta`.
2. Explain why `getMetrics` is not a normal product feature API.
3. Decide whether one of your app pages is using inspection when it should use normal reads.

## Chapter 38 References/Further Reading

- [src/runtime-tools.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/runtime-tools.ts)
- [src/store-registry.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store-registry.ts)
