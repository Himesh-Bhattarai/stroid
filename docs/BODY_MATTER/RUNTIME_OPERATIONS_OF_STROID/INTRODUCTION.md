# Unit Ten: Runtime Operations of Stroid

Unit opener

Some APIs do not create state or render UI. They inspect, reset, count, and sweep. These operations are not glamorous, but they are how serious systems look at themselves without pretending self-knowledge is free.

This unit covers the operational side of Stroid: the read/inspect tools and the admin reset boundary.

## Unit Objectives

- Understand `stroid/runtime-tools` and `stroid/runtime-admin`.
- Learn which operations are read-only and which are destructive.
- Use registry inspection without confusing it for normal app flow.
- Treat global cleanup as an operational act, not a casual helper.

# Chapter 37: Introduction to Runtime Operations

Chapter opener

Operations APIs are where a library admits it has a registry, a lifecycle, and a need for discipline beyond the happy path.

## Learning Objectives

- Define the role of runtime operations.
- Distinguish inspection from administration.
- Learn why these APIs live outside lean core.
- Understand the psychological difference between reading state and governing it.

## Chapter Outline

- 37.1 The Two Operational Subpaths
- 37.2 Why They Stay Separate
- 37.3 Operational Power and Restraint

## 37.1 The Two Operational Subpaths

Import paths:

```ts
import {
  listStores,
  getStoreMeta,
  getInitialState,
  getMetrics,
  getSubscriberCount,
  getAsyncInflightCount,
  getPersistQueueDepth,
  getComputedGraph,
  getComputedDeps,
} from "stroid/runtime-tools";
import { clearAllStores, clearStores } from "stroid/runtime-admin";
```

Table 37.1: Runtime Operations Split

| Subpath | Purpose |
|---|---|
| `runtime-tools` | inspect registry state |
| `runtime-admin` | perform destructive global cleanup |

## 37.2 Why They Stay Separate

Inspection and deletion are not the same moral act.

One asks:
- what exists?

The other asks:
- what should no longer exist?

That boundary is technical and psychological.

## 37.3 Operational Power and Restraint

### Figure 37.1: Read First, Destroy Deliberately

```text
runtime-tools -> inspect
runtime-admin -> clear
```

### Case Study 37.1: Why Destruction Needs Its Own Door

When dangerous operations look too similar to harmless ones, teams use them too casually.
Separate subpaths create friction.
That friction is often wisdom.

## Chapter 37 Summary

- Stroid splits runtime operations into inspection and administration.
- `runtime-tools` is read-oriented.
- `runtime-admin` is destructive.
- The split is a boundary worth preserving.

## Chapter 37 Review Questions

1. Why are `runtime-tools` and `runtime-admin` separated?
2. What kind of action belongs in each?
3. Why can friction be a good design choice?

## Chapter 37 Exercises/Activities

1. Explain why `clearAllStores` should not live in lean core.
2. List which runtime operations are safe in normal app code.
3. Describe how separate subpaths change team behavior.

## Chapter 37 References/Further Reading

- [src/runtime-tools.ts](/src/runtime-tools.ts)
- [src/runtime-admin.ts](/src/runtime-admin.ts)


## Navigation

- Previous: [Chapter 36: Real Use of Selectors Stroid](../SELECTORS_OF_STROID/REAL_USE.md)
- Jump to: [Unit Ten: Runtime Operations of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-ten-runtime-operations-of-stroid)
- Next: [Chapter 38: Inspection Tools and Registry Visibility](INSPECTION_TOOLS.md)

