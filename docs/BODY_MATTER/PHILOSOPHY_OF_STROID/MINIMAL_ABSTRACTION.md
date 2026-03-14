# Chapter 55: Minimal Abstraction

Chapter opener

Abstraction should compress complexity, not hide it until later.

## 55.1 What Stroid Tries Not to Hide

Stroid avoids pretending that state has no architecture.

It keeps the main verbs small:

- `createStore`
- `setStore`
- `getStore`
- `resetStore`
- `deleteStore`

Everything else grows outward from those verbs instead of replacing them.

### Example 55.1: Small API, Real Behavior

```ts
import { createStore, resetStore, setStore } from "stroid";

createStore("draft", { value: "" }, { scope: "temp" });
setStore("draft", "value", "hello");
resetStore("draft");
```

The surface stays direct.
The complexity is in the options and runtime rules, not in a maze of special setup APIs.

## 55.2 Minimal Does Not Mean Primitive

Minimal abstraction is often misunderstood as "remove features."

That is not the goal.
The goal is:

- few concepts
- stable concepts
- no second mental model for advanced usage

Persistence, sync, and devtools are more complex than core, but they still attach to the same store-centered contract.

## 55.3 Why This Matters in Real Architecture

When a library adds a new capability by inventing a new pattern, teams pay three times:

- they learn the feature
- they relearn the architecture
- they rewrite older assumptions

Stroid tries to keep growth additive instead of disruptive.

## Chapter 55 Summary

- Minimal abstraction means small stable concepts, not feature poverty.
- Stroid protects the main verbs instead of burying them under wrappers.
- Advanced capabilities reuse the same store-centered model.
- Architecture ages better when growth does not require a second worldview.


## Navigation

- Previous: [Chapter 54: Predictable State Mutation](PREDICTABLE_STATE_MUTATION.md)
- Jump to: [Unit Fourteen: Philosophy of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-fourteen-philosophy-of-stroid)
- Next: [Chapter 56: Runtime Observability](RUNTIME_OBSERVABILITY.md)
