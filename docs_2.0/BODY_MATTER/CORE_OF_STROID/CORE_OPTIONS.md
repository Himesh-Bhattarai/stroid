# Chapter 2: Core Options

Chapter opener

An API becomes trustworthy when its configuration reads like intention instead of ceremony. Stroid's option object exists so that behavior is declared once, close to the store, instead of being scattered across helpers and wrappers.

## Learning Objectives

- Understand every core option available at store creation time.
- Distinguish core options from feature-module options.
- Learn the frozen `scope` semantics.
- Recognize where validation, lifecycle, and error handling belong.

## Chapter Outline

- 2.1 The Shape of the Core Option Object
- 2.2 Scope, Validation, and Lifecycle
- 2.3 Which Options Need Extra Feature Imports

## 2.1 The Shape of the Core Option Object

The core creation signature is:

```ts
createStore(name, initialState, options)
```

The core option surface is centered around:

- `scope`
- `validate`
- `schema`
- `lifecycle`
- `onError`
- `snapshot`

These are part of Stroid's identity because they define what the store is allowed to do and how it should react when things go wrong.

### Example 2.1: A Core-Only Store With Rules

```ts
import { createStore } from "stroid";

createStore("profile", {
  name: "",
  age: 0,
}, {
  scope: "request",
  validate: (next) => typeof next.name === "string",
  onError: (message) => {
    console.error(message);
  },
  lifecycle: {
    onCreate: (initial) => console.log("created", initial),
    onSet: (prev, next) => console.log("changed", prev, next),
  },
});
```

This store uses no optional feature module. It is still meaningful because core is not just storage. Core is state plus policy.

### Example 2.2: Schema as the Stronger Gate

```ts
createStore("settings", {
  theme: "light",
  locale: "en",
}, {
  schema: {
    safeParse(value: any) {
      const ok =
        value &&
        (value.theme === "light" || value.theme === "dark") &&
        typeof value.locale === "string";

      return ok
        ? { success: true, data: value }
        : { success: false, error: "Invalid settings shape" };
    },
  },
});
```

Use `validate` for simple boolean gates. Use `schema` when data shape is a contract, not a suggestion.

Important note:
Lifecycle middleware is synchronous.
If middleware returns a `Promise`, Stroid rejects that update instead of committing async uncertainty into store state.

Another important note:
Middleware is not a secret tunnel around validation.
If middleware changes the next value, Stroid still sanitizes and validates the final result before commit.

### Snapshot Strategy (Performance vs Safety)

Snapshots are used by subscriptions and selectors. By default, Stroid deep-clones snapshots for safety.
You can trade some safety for speed on large or frequently updated stores:

```ts
createStore("feed", initialFeed, {
  snapshot: "shallow", // or "ref"
});
```

Modes:
- `deep` (default): deep clone + dev-freeze snapshot values.
- `shallow`: only clone the top level; nested objects are shared.
- `ref`: return the live store reference without cloning.

Use `shallow` or `ref` only if your updates are immutable and you accept that
mutating a snapshot can affect other subscribers.

## 2.2 Scope, Validation, and Lifecycle

The most important frozen semantic in current core is `scope`.

Table 2.1: Scope Semantics

| Scope | Meaning | Current Runtime Effect |
|---|---|---|
| `request` | Default general-purpose store | Default scope |
| `global` | Long-lived shared store | Enables SSR global-store opt-in |
| `temp` | Ephemeral store class | Disables persist, sync, and devtools defaults unless explicitly enabled; history defaults to `0` |

This is important because Stroid now treats `scope` as more than decoration.

### `scope: "request"`

Use this for normal application state. It is the default when no scope is supplied.

```ts
createStore("checkout", { step: 1 });
```

### `scope: "global"`

Use this when you intentionally want long-lived global semantics, especially around server-side environments.

```ts
createStore("theme", { mode: "dark" }, {
  scope: "global",
});
```

### `scope: "temp"`

Use this for state that feels disposable: dropdown state, wizard scratch state, filters-in-progress, inline form drafts.

```ts
createStore("searchDraft", {
  query: "",
  open: false,
}, {
  scope: "temp",
});
```

If you explicitly enable persistence on a temp store, Stroid preserves your choice but warns, because the declared intent and the feature choice are pulling in opposite directions.

### Figure 2.1: Temp Scope as a Guardrail, Not a Jail

```ts
createStore("draftForm", { value: "" }, {
  scope: "temp",
  persist: true,
});
```

This is allowed.

The runtime warning exists to ask a good question:

"Are you sure you want a supposedly temporary memory to outlive the moment that created it?"

That kind of friction is good documentation inside the runtime.

## 2.3 Which Options Need Extra Feature Imports

Some options belong to the unified creation object, but they are powered by optional feature modules.

Table 2.2: Core and Feature-Split Options

| Option Group | Lives in the same options object? | Needs explicit feature import? |
|---|---|---|
| `scope` | Yes | No |
| `validate` | Yes | No |
| `schema` | Yes | No |
| `lifecycle` | Yes | No |
| `onError` | Yes | No |
| `persist` | Yes | Yes: `stroid/persist` |
| `sync` | Yes | Yes: `stroid/sync` |
| `devtools` | Yes | Yes: `stroid/devtools` |

### Case Study 2.1: One Shape, Different Weight

This example keeps one mental model while changing bundle and runtime behavior intentionally:

```ts
import { createStore } from "stroid";
import "stroid/persist";
import "stroid/devtools";

createStore("auth", {
  user: null,
  token: null,
}, {
  scope: "global",
  persist: {
    key: "app_auth",
    version: 2,
  },
  devtools: {
    enabled: true,
    historyLimit: 25,
  },
  lifecycle: {
    onSet: (prev, next) => {
      console.log("auth changed", prev, next);
    },
  },
});
```

The options object stays unified. The imports decide which power systems are alive.

## Chapter 2 Summary

- Core options define store intent, validation rules, lifecycle behavior, and failure handling.
- `request` is the default scope, `global` has real SSR impact, and `temp` now has lighter runtime defaults.
- Optional features still belong to the same option object, but their implementations are activated by explicit imports.
- This design keeps Stroid coherent without making the default package pretend to do everything automatically.

## Chapter 2 Review Questions

1. Why is `scope` now meaningful instead of just descriptive metadata?
2. When should you choose `validate` instead of `schema`?
3. Why does Stroid keep `persist`, `sync`, and `devtools` inside the same option object even though they are split by import path?

## Chapter 2 Exercises/Activities

1. Write a `temp` store for a dropdown and explain why its defaults are appropriate.
2. Convert a plain store into a `global` store and describe what changes conceptually.
3. Create a store that uses `schema`, `lifecycle.onSet`, and `onError` together, then explain the order in which those concerns matter.

## Chapter 2 References/Further Reading

- [src/adapters/options.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/adapters/options.ts)
- [docs/04-createStore.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs/04-createStore.md)
- [docs/16-middleware.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs/16-middleware.md)
- [docs/17-schema.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs/17-schema.md)


## Navigation

- Previous: [Chapter 1: Introduction to Core Stroid](INTRODUCTION.md)
- Jump to: [Unit One: Core of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-one-core-of-stroid)
- Next: [Chapter 3: Core Examples](EXAMPLE.md)
