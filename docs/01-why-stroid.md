# Chapter 1 -- Why Stroid

> "Every state library promises simplicity. Few stay simple once you ship."

---

## The Problem

Redux brings ceremony. Zustand brings inconsistency. Context brings re-renders. Most tools make you choose between power and ease.

---

## What Developers Actually Want

```js
createStore("user", { name: "Eli", theme: "dark" }) // define
setStore("user.name", "Jo")                          // update
const name = useStore("user.name")                   // read
```

One mental model everywhere.

---

## The Stroid Answer

- Minimal surface: create -> set -> read.
- Opt-in features: persistence, sync, middleware, schema, devtools.
- Works in plain JS and React; no Provider required.

---

## What Makes Stroid Different

- Safety guardrails: path validation, schema/validator hooks, middleware pipeline.
- Observability: history, metrics, devtools, async metrics.
- Modularity without extra packages: everything configured via `createStore` options.

---

**[<- Table of Contents](./README.md) :: [Chapter 2 -- Getting Started ->](./02-getting-started.md)**
