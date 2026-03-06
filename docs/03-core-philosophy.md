# Chapter 3 -- Core Philosophy

> "Simple things should be simple. Complex things should be possible."

---

## The Three Rules

1. One mental model -- create, set, read. Everything else hangs off these verbs.
2. Declare intent -- you state the desired outcome; stroid handles cloning, validation, and notifications.
3. Pay only for what you use -- features stay off until you enable them in `createStore` options.

---

## Shallow Merge By Default

```js
createStore("user", { name: "Eli", theme: "dark" })
setStore("user", { name: "Jo" }) // theme stays
```

Replacement is explicit: pass the full branch you want.

---

## Dot-Path Navigation

```js
setStore("user", "address.city", "NYC")
const city = getStore("user", "address.city")
```

Paths are passed separately from the store name and validated to avoid silent undefined access and over-deep trees.

---

## Modular, Not Fragmented

Persistence, sync, middleware, schema, devtools, history, and metrics are configured through `createStore` -- no extra packages or Providers required in v0.0.4.

---

**[<- Chapter 2 -- Getting Started](./02-getting-started.md) :: [Chapter 4 -- createStore ->](./04-createStore.md)**
