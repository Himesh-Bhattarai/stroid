# Chapter 74: Intentional Bugs, Guardrails, and Productive Friction

Chapter opener

Some behaviors look broken only because they refuse to flatter the caller.
This chapter catalogs the current Stroid bug reports that are classified as `Intentional`.
The point is not to romanticize awkwardness.
The point is to stop mislabeling design decisions as accidents.

## Learning Objectives

- Know which current bug reports are intentional by design.
- Understand the design logic behind those behaviors.
- Distinguish guardrails from unfinished work.
- Build a more honest expectation of what Stroid is trying to optimize.

## Chapter Outline

- 74.1 Intentional Guardrails in Core
- 74.2 Intentional Tradeoffs in Async, Sync, and Devtools
- 74.3 Intentional Weirdness Outside the Happy Path

## 74.1 Intentional Guardrails in Core

Table 74.1: Intentional Core Behaviors From `BUG_REPORT.md`

| Bug | Current verdict | Why it stays |
|---|---|---|
| 2 | Intentional | object-merge `setStore(name, { ... })` stays flexible unless schema or validator says otherwise |
| 7 | Intentional | duplicate `createStore(...)` returning `{ name }` is the current API contract |
| 8 | Intentional | out-of-bounds array path writes are blocked to prevent silent path creation |
| 13 | Intentional | `getStore(...)` deep-clones for defensive read safety |
| 44 | Intentional | `resetStore(...)` is a reset policy, not a normal middleware pipeline |
| 46 | Intentional | `deleteStore(...)` uses lifecycle/feature hooks, not middleware transforms |
| 51 / 81 | Intentional | existing-store `createStore(...)` returning `{ name }` is footgun-prone but still deliberate |
| 54 | Intentional | object merge is shallow by contract, so nested branches can be replaced |

### Example 74.1: Why Path Writes Are Stricter Than Merge Writes

This is deliberate:

- path writes are the precise API
- object merges are the forgiving API

That difference can feel inconsistent.
It is actually a policy split:

- one path for exactness
- one path for looser object updates

## 74.2 Intentional Tradeoffs in Async, Sync, and Devtools

Table 74.2: Intentional Feature-Layer Behaviors

| Bug | Current verdict | Why it stays |
|---|---|---|
| 1 | Intentional | sync ordering is deterministic ordering, not true distributed causality |
| 16 | Intentional | devtools history cloning is opt-in cost, not surprise core cost |
| 22 | Intentional | deferred persistence save uses batching and may lose a last-moment unload race |
| 30 | Intentional | `subscribeWithSelector(...)` clones values before listeners for safety |
| 32 | Intentional | inline React selectors are not stabilized for the user |
| 50 | Intentional | subscriber flush is synchronous per store, which is a scale tradeoff |
| 104 | Intentional | deleting and recreating a store clears remembered async fetch definitions |

### Example 74.2: Sync Is Ordered, Not Omniscient

The sync layer chooses a practical ordering rule:

- logical clock
- timestamp
- source tie-breaker

That is enough for deterministic convergence in many local-peer cases.
It is not a PhD thesis in causality.
That limitation is documented because pretending otherwise would be comedy, not engineering.

## 74.3 Intentional Weirdness Outside the Happy Path

Table 74.3: Intentional Package and Architecture Behaviors

| Report | Current verdict | Why it stays |
|---|---|---|
| Bug 6 | Intentional | proxy-based `createSelector(...)` tracking is expensive because that tracking is the feature |
| Bug 29 | Intentional | non-string `Map` keys are rejected by `sanitize(...)` for JSON-safe state policy |
| Side-effect feature registration disappearing if imports vanish | Intentional | split package design depends on explicit `import \"stroid/persist\"` style registration |
| Recursive subscriber updates can livelock microtasks | Intentional | this is user-land logic loop risk, not store corruption |
| Hydrating snapshots without options can lose expected features | Intentional | hydration only restores the options you actually pass |

### Figure 74.1: Productive Friction

```text
explicit import -> explicit behavior
missing import -> explicit warning
silent magic    -> rejected by design
```

### Case Study 74.1: The Runtime Declines to Babysit You

If a feature runtime could silently appear without import, the first demo would feel smoother.
The tenth debugging session would feel cursed.

Stroid chooses the mildly embarrassing warning now over the haunted architecture later.

That is healthy.
Also slightly annoying.
Also healthy.

## Chapter 74 Summary

- Many bug-like behaviors in Stroid are deliberate contracts, not mistakes.
- Core guardrails tend to protect shape, lifecycle, and explicitness.
- Feature-layer tradeoffs exist because optional power always costs something.
- Split imports and strict warnings are part of the package philosophy, not accidental roughness.

## Chapter 74 Review Questions

1. Which intentional behaviors in core are mostly about safety?
2. Why is sync ordering classified as intentional rather than silently called "good enough"?
3. What is the architecture reason for side-effect feature registration?

## Chapter 74 Exercises/Activities

1. Pick three `Intentional` bugs and explain why removing the friction would create a worse contract.
2. Write a short note explaining why devtools cost is acceptable only when devtools is explicitly enabled.
3. Explain why a shallow merge API should not pretend to be a deep merge API.

## Chapter 74 References/Further Reading

- [BUG_REPORT.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/BUG_REPORT.md)
- [store.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store.ts)
- [async.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/async.ts)
- [features/devtools.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/devtools.ts)
- [features/sync.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/sync.ts)

## Navigation

- Previous: [Chapter 73: Introduction to Bug as Helper](INTRODUCTION.md)
- Jump to: [Unit Seventeen: Bug as Helper](../../FRONT_MATTER/CONTENTS.md#unit-seventeen-bug-as-helper)
- Next: [Chapter 75: No Need to Fix, Low Drama, and Edge-Case Humility](NO_NEED_TO_FIX.md)
