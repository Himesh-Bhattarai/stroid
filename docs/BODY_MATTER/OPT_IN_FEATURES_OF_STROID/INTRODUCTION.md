# Unit Two: Opt-In Features of Stroid

Unit opener

Power becomes dangerous when it is invisible. Stroid's opt-in model exists so that advanced behavior arrives by intention, not by accident.

This unit explains every important non-core import path in the current package. The goal is not only to list features, but to show why Stroid keeps them modular while preserving one mental model.

## Unit Objectives

- Understand what "opt-in" means in the Stroid package architecture.
- Learn which imports activate store features and which imports expose separate runtime layers.
- Distinguish store-attached features from utility and tooling subpaths.
- Build a practical import strategy for real applications.

# Chapter 5: Introduction to Opt-In Features

Chapter opener

A good runtime should not make advanced behavior free in the wrong sense. Free features often become hidden costs: larger bundles, blurrier mental models, and systems that are doing more than the developer remembers.

## Learning Objectives

- Define the difference between lean core and opt-in modules.
- Identify the main categories of Stroid opt-ins.
- Understand why Stroid keeps one option-object design even across split modules.
- Learn the import rule that governs the current package.

## Chapter Outline

- 5.1 What "Opt-In" Means in Stroid
- 5.2 Categories of Optional Features
- 5.3 One Mental Model, Many Entry Points

## 5.1 What "Opt-In" Means in Stroid

In Stroid, an opt-in feature is a capability that does not activate merely because the package exists. It activates because you import the module that makes that behavior real.

That matters for two reasons:

1. It keeps the default runtime lean.
2. It keeps feature cost honest.

The core package gives you:

- named stores
- create, read, update, reset, delete
- hydration
- lifecycle
- validation and schema gates

Opt-in modules add specialized behavior on top of that.

### Example 5.1: Lean Core Only

```ts
import { createStore, setStore } from "stroid";

createStore("draft", { value: "" }, { scope: "temp" });
setStore("draft", "value", "hello");
```

This store has no persistence, sync, or devtools behavior. That is intentional.

### Example 5.2: Explicit Feature Activation

```ts
import { createStore } from "stroid";
import "stroid/persist";
import "stroid/devtools";

createStore("theme", { mode: "dark" }, {
  persist: true,
  devtools: true,
});
```

The shape of the store API did not change. The runtime power did.

## 5.2 Categories of Optional Features

Stroid's opt-in surface is easiest to understand in three groups.

Table 5.1: Categories of Opt-In Features

| Category | Import Paths | Purpose |
|---|---|---|
| Store-attached features | `stroid/persist`, `stroid/sync`, `stroid/devtools` | Add behavior directly to stores via options |
| Runtime and UI layers | `stroid/react`, `stroid/async`, `stroid/selectors` | Add React integration, async orchestration, and selector subscriptions |
| Power tools and helpers | `stroid/helpers`, `stroid/server`, `stroid/runtime-tools`, `stroid/runtime-admin`, `stroid/testing` | Add convenience, inspection, admin, server, and test utilities |

These are all part of the ecosystem, but they do not deserve equal weight in every application.

Note:
`stroid/chain` is not exported in the current build. References to chain in this book are forward-looking and should be treated as placeholders until the subpath exists.

## 5.3 One Mental Model, Many Entry Points

The clever part of Stroid's design is not splitting by file. It is splitting without forcing a second way of thinking.

Even when imports change, the center stays the same:

- the store has a name
- the store has state
- the store has an option object
- the runtime honors explicit intent

### Figure 5.1: Split Imports Without Fragmented Design

```ts
import { createStore } from "stroid";
import "stroid/persist";
import "stroid/sync";

createStore("cart", { items: [] }, {
  persist: true,
  sync: true,
});
```

### Case Study 5.1: Why This Matters in Real Teams

In many libraries, adding a feature changes the architecture more than the behavior. Suddenly there is middleware setup, plugin wrapping, or new boilerplate around every store.

Stroid tries to avoid that trap:

- feature imports decide what becomes available
- option groups decide what a store asks for
- the store API remains stable

That reduces migration stress. It also reduces the psychological cost of growth, because people do not feel like they are learning a different library every time the app gets more complex.

## Chapter 5 Summary

- Stroid opt-ins are explicit modules, not silent default behavior.
- The optional surface falls into store features, runtime layers, and power tools.
- Splitting is useful only because the mental model stays unified.
- Stroid's package structure is designed to preserve clarity, not just reduce bytes.

## Chapter 5 Review Questions

1. Why is an explicit feature import better than silent auto-registration?
2. What is the difference between a store-attached feature and a runtime layer?
3. How does Stroid keep the package split from feeling fragmented?

## Chapter 5 Exercises/Activities

1. List the opt-in features your app actually needs and separate them into the three categories above.
2. Rewrite one example store using only core, then extend it with one explicit feature import.
3. Explain why a lean root package can improve understanding, not just bundle size.

## Chapter 5 References/Further Reading

- [src/index.ts](/src/index.ts)
- [src/core.ts](/src/core.ts)
- [src/feature-registry.ts](/src/feature-registry.ts)


## Navigation

- Previous: [Chapter 4: Real Use of Core Stroid](../CORE_OF_STROID/REAL_USE.md)
- Jump to: [Unit Two: Opt-In Features of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-two-opt-in-features-of-stroid)
- Next: [Chapter 6: Store-Attached Features](STORE_FEATURES.md)

