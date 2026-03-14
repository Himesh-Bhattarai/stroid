# Unit Eight: Devtools of Stroid

Unit opener

Debugging tools are dangerous when they quietly become decision-making tools for production architecture. A good devtools story helps you inspect the system without convincing you the inspection layer is the system.

This unit explains `stroid/devtools` as a feature module, a history surface, and a boundary that should stay useful without becoming addictive.

## Unit Objectives

- Understand what `stroid/devtools` registers and exports.
- Learn how history and Redux DevTools integration work.
- See why redaction and history limits matter.
- Keep debugging power in its proper place.

# Chapter 29: Introduction to Devtools Stroid

Chapter opener

Inspection changes how people think. The moment a team can replay, inspect, and diff state, their confidence rises. The risk is that the team then starts designing for the debugger instead of the product.

## Learning Objectives

- Define the role of `stroid/devtools`.
- Distinguish feature registration from exported inspection APIs.
- Learn what `devtools` options actually control.
- Understand why history belongs outside lean core.

## Chapter Outline

- 29.1 What the Devtools Subpath Does
- 29.2 History APIs
- 29.3 Why Devtools Stay Separate

## 29.1 What the Devtools Subpath Does

Import path:

```ts
import "stroid/devtools";
```

This registers the devtools/history runtime.

### Example 29.1: Minimal Devtools Use

```ts
createStore("profile", { name: "Ari" }, {
  devtools: true,
});
```

## 29.2 History APIs

Unlike `persist` and `sync`, the devtools subpath also exports functions:

```ts
import { getHistory, clearHistory } from "stroid/devtools";
```

Table 29.1: Devtools Public Surface

| Surface | Purpose |
|---|---|
| side-effect import | registers devtools/history feature |
| `getHistory(name, limit?)` | read recorded entries |
| `clearHistory(name?)` | clear one store or all history |

## 29.3 Why Devtools Stay Separate

Devtools are useful because they are optional.

### Figure 29.1: Inspect Without Polluting Core

```text
core runtime -> state behavior
devtools layer -> inspection behavior
```

### Case Study 29.1: Why Inspection Should Not Become Identity

Teams often trust what they can inspect.
That is rational.
But if the library begins to center every decision around inspection hooks, the core model becomes distorted.

Devtools should clarify runtime truth, not replace it.

## Chapter 29 Summary

- `stroid/devtools` both registers behavior and exports history APIs.
- History belongs to the devtools layer, not lean core.
- Devtools are strongest when they illuminate design instead of dictating it.

## Chapter 29 Review Questions

1. What makes `stroid/devtools` different from `stroid/persist` and `stroid/sync`?
2. Why do history APIs belong outside core?
3. What is the danger of designing for inspection instead of for runtime truth?

## Chapter 29 Exercises/Activities

1. Enable devtools on a store and explain why that should remain explicit.
2. Describe one use case for `getHistory`.
3. Explain why a debugger-friendly design can still be a bad runtime design.

## Chapter 29 References/Further Reading

- [src/devtools.ts](/src/devtools.ts)
- [src/devtools-api.ts](/src/devtools-api.ts)
- [src/features/devtools.ts](/src/features/devtools.ts)


## Navigation

- Previous: [Chapter 28: Real Use of Persist Stroid](../PERSIST_OF_STROID/REAL_USE.md)
- Jump to: [Unit Eight: Devtools of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-eight-devtools-of-stroid)
- Next: [Chapter 30: History, Diffs, and Redaction](HISTORY_AND_REDACTION.md)

